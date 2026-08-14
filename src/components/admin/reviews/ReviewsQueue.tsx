"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Toast, useToast } from "@/components/ui/Toast";
import { dismissReviewReports, setReviewStatus } from "@/lib/actions/reviews";
import { ReviewCard } from "./ReviewCard";
import { ReviewDetailPanel } from "./ReviewDetailPanel";
import type { ModerationAction } from "./ModerationActions";
import type {
  ReviewCardRow,
  ReviewDetailPayload,
  ReviewStatusValue,
} from "./types";

/**
 * The moderation queue: the list, the panel it opens, and the outcome of every
 * decision made in either.
 *
 * A client component wrapping server-rendered rows, rather than a client
 * component that fetches them. The filtering, the counting and the paging all
 * stay in the URL and on the server — where the rest of this dashboard keeps
 * them — and this owns only what genuinely cannot live there: which review is
 * open, which button is mid-flight, and what to say when it lands.
 *
 * Decisions are applied optimistically and then confirmed. A moderator works
 * this screen in bursts, and waiting out a round trip per review — each of
 * which revalidates the product page, the catalogue and the home page — turns
 * clearing ten reviews into a minute of watching buttons. If the server refuses,
 * the row goes back to what it was and the refusal is what the snackbar says.
 */
export function ReviewsQueue({
  rows,
  canModerate,
}: {
  rows: ReviewCardRow[];
  canModerate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [openId, setOpenId] = useState<string | null>(null);
  /** Which review has an action in flight, and which action. */
  const [busy, setBusy] = useState<{ id: string; action: ModerationAction } | null>(
    null,
  );
  /**
   * Local truth, until the server's catches up.
   *
   * Keyed by review id and dropped wholesale whenever a fresh page of rows
   * arrives, because at that point the server's copy *is* the truth and a
   * lingering override could only ever disagree with it.
   */
  const [overrides, setOverrides] = useState<
    Record<string, { status?: ReviewStatusValue; reportsCleared?: boolean }>
  >({});

  /**
   * A fresh page of rows *is* the truth, so anything held over it is dropped.
   *
   * Adjusted during render against the previous value rather than in an effect,
   * which is React's own guidance for state derived from a prop — and what
   * `ReviewReplies` already does with its composer. An effect would paint one
   * frame of the stale override before clearing it.
   */
  const [lastRows, setLastRows] = useState(rows);
  if (lastRows !== rows) {
    setLastRows(rows);
    setOverrides({});
  }

  const applied = rows.map((row) => {
    const override = overrides[row.id];
    if (!override) return row;
    return {
      ...row,
      status: override.status ?? row.status,
      reports: override.reportsCleared ? [] : row.reports,
    };
  });

  const open = applied.find((row) => row.id === openId) ?? null;

  /* ---------------------------------------------------------------------- */
  /* The detail panel's contents                                            */
  /* ---------------------------------------------------------------------- */

  const [detail, setDetail] = useState<ReviewDetailPayload | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  /**
   * Which request is the current one.
   *
   * A moderator clicking down a list faster than the network answers would
   * otherwise see the *first* response overwrite the panel they are now looking
   * at. The id of the row asked for last is the only response worth keeping.
   */
  const wanted = useRef<string | null>(null);

  const loadDetail = (id: string) => {
    wanted.current = id;
    setDetail(null);
    setDetailError(null);

    void (async () => {
      try {
        const response = await fetch(`/api/admin/reviews/${id}`);
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(body?.message ?? "That did not load.");
        }

        const payload = (await response.json()) as ReviewDetailPayload;
        if (wanted.current !== id) return;
        setDetail(payload);
      } catch (cause) {
        if (wanted.current !== id) return;
        // Whatever the endpoint said, or a plain sentence — never the raw
        // exception, which on a network failure is "Failed to fetch".
        setDetailError(
          cause instanceof Error && cause.message !== "Failed to fetch"
            ? cause.message
            : "Could not load this review. Check your connection and try again.",
        );
      }
    })();
  };

  const openReview = (row: ReviewCardRow) => {
    setOpenId(row.id);
    loadDetail(row.id);
  };

  const closePanel = () => {
    // Nothing in flight matters once the panel is shut, and dropping the id
    // stops a late response repopulating a panel nobody is looking at.
    wanted.current = null;
    setOpenId(null);
    setDetail(null);
    setDetailError(null);
  };

  const run = (row: ReviewCardRow, action: ModerationAction) => {
    if (!canModerate || busy) return;

    const before = { status: row.status, reports: row.reports };

    // What the row will look like if the server agrees. Hiding settles the
    // open reports with it, which is what the action does server-side — the
    // two have to agree or the card would keep a flag the database has closed.
    setOverrides((current) => ({
      ...current,
      [row.id]:
        action === "publish"
          ? { status: "PUBLISHED" }
          : action === "hide"
            ? { status: "HIDDEN", reportsCleared: true }
            : { reportsCleared: true },
    }));
    setBusy({ id: row.id, action });

    startTransition(async () => {
      const result =
        action === "dismiss"
          ? await dismissReviewReports(row.id)
          : await setReviewStatus(row.id, action === "publish" ? "PUBLISHED" : "HIDDEN");

      setBusy(null);

      if (result.message) {
        // Refused. Put the row back rather than leave the screen claiming
        // something the database does not say.
        setOverrides((current) => ({
          ...current,
          [row.id]: { status: before.status, reportsCleared: before.reports.length === 0 },
        }));
        toast.show(result.message, "error");
        return;
      }

      toast.show(result.success ?? "Done.");
      // Re-reads the page: the counts on the rail, the summary figures and
      // whether this review still belongs in the tab it is sitting in.
      router.refresh();
    });
  };

  return (
    <>
      <ul className="space-y-3">
        {applied.map((row) => (
          <li key={row.id}>
            <ReviewCard
              review={row}
              canModerate={canModerate}
              pending={busy?.id === row.id ? busy.action : null}
              onAction={(action) => run(row, action)}
              onOpen={() => openReview(row)}
            />
          </li>
        ))}
      </ul>

      <ReviewDetailPanel
        review={open}
        detail={detail}
        error={detailError}
        onRetry={() => openId && loadDetail(openId)}
        open={openId !== null}
        onClose={closePanel}
        canModerate={canModerate}
        pending={busy?.id === open?.id ? (busy?.action ?? null) : null}
        onAction={(action) => {
          if (!open) return;
          run(open, action);
          // Publishing or hiding from the panel is the end of that review's
          // turn; the queue is the thing being worked, so it gets the focus
          // back. Dismissing a report is not — the moderator is usually still
          // reading the complaint they just settled.
          if (action !== "dismiss") closePanel();
        }}
      />

      <Toast message={toast.message} onDismiss={toast.dismiss} />
    </>
  );
}
