import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Category tree helpers.
 *
 * The catalogue is self-nesting, which buys flexibility at the cost of one
 * thing: "show me everything under Laptops" is no longer a single equality
 * check. That cost is paid here, once.
 *
 * The whole tree is loaded and walked in memory rather than queried
 * recursively. A category list is small (tens of rows, not thousands) and this
 * keeps it to one round trip with no recursive CTE or raw SQL — revisit only
 * if the catalogue ever grows a genuinely deep, wide tree.
 */

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  /** 0 for a top-level category, 1 for its children, and so on. */
  depth: number;
  children: CategoryNode[];
}

export interface FlatCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  depth: number;
  /** "Laptops → Workstations", for pickers and breadcrumbs. */
  path: string;
}

type Row = { id: string; name: string; slug: string; parentId: string | null };

async function loadRows(): Promise<Row[]> {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, parentId: true },
  });
}

/**
 * Build the forest from a flat row list.
 *
 * A row whose parent is missing is treated as top-level. That matters because
 * `parentId` is only `SetNull` on delete — but a cycle introduced by hand
 * would otherwise strand rows invisibly, and this keeps them reachable.
 */
function buildForest(rows: Row[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  for (const row of rows) {
    byId.set(row.id, { ...row, depth: 0, children: [] });
  }

  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Assign depth by walking down, so a node's depth cannot depend on the order
  // rows happened to arrive in.
  const stack = roots.map((node) => ({ node, depth: 0 }));
  const seen = new Set<string>();
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    // Guard against a hand-made cycle turning this into an infinite loop.
    if (seen.has(node.id)) continue;
    seen.add(node.id);

    node.depth = depth;
    for (const child of node.children) stack.push({ node: child, depth: depth + 1 });
  }

  return roots;
}

/** A category's top-level ancestor, which is what products are grouped by. */
export interface RootCategory {
  id: string;
  name: string;
  slug: string;
}

/**
 * Map every category to the top-level category it descends from.
 *
 * This is what comparison is locked to. Locking to the exact category would be
 * too strict — a MacBook sits in "Student Laptops" and an XPS in "Ultrabooks",
 * and refusing to compare two laptops because of that would be absurd. Locking
 * to the root is the useful reading of "same kind of thing": both are Laptops,
 * neither is Audio.
 *
 * A category whose parent chain is broken resolves to itself, matching how
 * `buildForest` treats an orphan as top-level.
 */
export async function getRootCategories(): Promise<Map<string, RootCategory>> {
  const rows = await loadRows();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const roots = new Map<string, RootCategory>();

  for (const row of rows) {
    let cursor = row;
    const seen = new Set<string>([cursor.id]);

    while (cursor.parentId) {
      const parent = byId.get(cursor.parentId);
      // Missing parent, or a hand-made cycle: stop where we are rather than
      // loop forever.
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      cursor = parent;
    }

    roots.set(row.id, { id: cursor.id, name: cursor.name, slug: cursor.slug });
  }

  return roots;
}

/** The full tree, roots first, each level sorted by name. */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  return buildForest(await loadRows());
}

/** Depth-first flattening — the order a nested picker should list them in. */
export function flatten(nodes: CategoryNode[]): FlatCategory[] {
  const out: FlatCategory[] = [];

  const walk = (node: CategoryNode, trail: string[]) => {
    const path = [...trail, node.name];
    out.push({
      id: node.id,
      name: node.name,
      slug: node.slug,
      parentId: node.parentId,
      depth: node.depth,
      path: path.join(" → "),
    });
    for (const child of node.children) walk(child, path);
  };

  for (const node of nodes) walk(node, []);
  return out;
}

/** Every category, depth-first with its ancestry — for selects and lists. */
export async function getFlatCategories(): Promise<FlatCategory[]> {
  return flatten(await getCategoryTree());
}

/**
 * A category's id plus every id beneath it.
 *
 * This is what makes `?category=laptops` return workstations and ultrabooks
 * too. Returns an empty array when the slug matches nothing, which callers
 * should read as "no results" rather than "no filter".
 */
export async function getCategoryAndDescendantIds(slug: string): Promise<string[]> {
  const rows = await loadRows();

  const root = rows.find((row) => row.slug === slug);
  if (!root) return [];

  const childrenByParent = new Map<string, Row[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const siblings = childrenByParent.get(row.parentId);
    if (siblings) siblings.push(row);
    else childrenByParent.set(row.parentId, [row]);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);

    ids.push(node.id);
    stack.push(...(childrenByParent.get(node.id) ?? []));
  }

  return ids;
}

/**
 * Would making `parentId` the parent of `categoryId` create a cycle?
 *
 * Guards the admin forms: a category cannot be its own ancestor, and without
 * this check a self-referencing tree can be knotted into a loop that no longer
 * renders anywhere.
 */
export async function wouldCreateCycle(
  categoryId: string,
  parentId: string | null,
): Promise<boolean> {
  if (!parentId) return false;
  if (parentId === categoryId) return true;

  const rows = await loadRows();
  const byId = new Map(rows.map((row) => [row.id, row]));

  let cursor = byId.get(parentId);
  const seen = new Set<string>();

  while (cursor) {
    if (cursor.id === categoryId) return true;
    if (seen.has(cursor.id)) break; // Already-broken data; do not spin on it.
    seen.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  return false;
}
