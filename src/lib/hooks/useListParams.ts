"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Read and rewrite the query string a list is filtered by.
 *
 * The same principle `ListToolbar` established: the filter state *is* the URL,
 * so the server does the filtering and a filtered view is a link like any
 * other. This is that logic pulled out, because the sort control, the page-size
 * selector, the date range and the view toggle all need it and none of them
 * belong in the search box.
 *
 * `isPending` is the transition the navigation runs in — which is what lets the
 * list say it is working instead of sitting still for a second and then
 * changing under the reader.
 */
export function useListParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  /**
   * @param resetPage Almost always right. Narrowing a list while standing on
   *   page 7 should land you on page 1 of the new result, not on page 7 of it —
   *   which is usually empty, and reads as "your filter matched nothing".
   */
  const set = (
    next: Record<string, string | null>,
    { resetPage = true }: { resetPage?: boolean } = {},
  ) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }

    if (resetPage) params.delete("page");

    const search = params.toString();
    startTransition(() => {
      // `replace`, not `push`: changing the sort four times should not put four
      // entries in the history for the back button to crawl through.
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    });
  };

  const get = (key: string) => searchParams.get(key) ?? "";

  return { get, set, isPending, searchParams };
}
