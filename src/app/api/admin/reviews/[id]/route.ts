import { verifiedAdmin } from "@/lib/auth/dal";
import { getReviewDetail } from "@/lib/reviews/service";

/**
 * One review, in full, for the moderation drawer.
 *
 * A route handler rather than data rendered with the list, because the panel's
 * extras are per-review and expensive in a way the list is not: the order the
 * customer bought on, the product's own rating, every report including the
 * settled ones, and the reply thread. Fetching them for twenty rows to show one
 * is twenty times the work for a panel that is usually never opened.
 *
 * A server action could return the same data, but this is a *read* keyed by an
 * id — a GET with a URL the browser can cache and retry is the honest shape for
 * that, and it gives the panel a real error to offer a retry against.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Re-read from the database rather than trusting the token: this hands over
  // a customer's name, their order reference and who reported them, so a token
  // issued before a demotion must not open it.
  const admin = await verifiedAdmin();
  if (!admin) {
    return Response.json({ message: "Not authorised" }, { status: 403 });
  }

  const { id } = await params;
  const review = await getReviewDetail(id);

  if (!review) {
    return Response.json({ message: "That review no longer exists." }, { status: 404 });
  }

  // No caching: a moderator opening a panel is asking what is true *now*, and
  // a stale status here is the one thing this screen must never show.
  return Response.json(review, {
    headers: { "Cache-Control": "no-store" },
  });
}
