type ClassValue = string | number | null | undefined | false;

/**
 * Minimal className joiner. Deliberately not clsx + tailwind-merge: nothing in
 * this codebase overrides a utility from a parent, so conflict resolution would
 * be dead weight. Swap it in here if that changes.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
