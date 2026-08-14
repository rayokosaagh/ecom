# docs

Development records, not user documentation. Start with the root
[`README.md`](../README.md) for what the project is and how to run it, and with
[`prisma/schema.prisma`](../prisma/schema.prisma) for how it is modelled — the
schema carries the reasoning for most of the decisions here.

| File | What it is |
|---|---|
| [`BUILD-REPORT.md`](BUILD-REPORT.md) | A build-and-operate report: what was changed in a working session, what was measured, and how to run and extend it afterwards. |
| [`work-report.md`](work-report.md) | A longer running record — what changed, why, **what was tried and rejected**, and operating guides for the parts that need operating. |
| [`2026-08-10-session-report.md`](2026-08-10-session-report.md) | One day, both parallel sessions, merged: wallet payments, collection orders, inventory, social links, and the abandoned-basket bug. Ends with the principles the codebase runs on and the traps that cost time. |
| [`2026-08-13-session-report.md`](2026-08-13-session-report.md) | Two streams: the brands menu and the combined hero with its specification hotspots, and the typography/motion token migration. |
| [`2026-08-15-session-report.md`](2026-08-15-session-report.md) | Three streams: the stacked home layout removed and the skeletons rebuilt, the reviews screen turned into a moderation queue, the stock pill made variant-aware, and the account hero. |

All are point-in-time records. Where one disagrees with the code, the code is
right — these say *why* something was done, and the schema and the `check:`
suites say *what is true now*.
