# docs

Development records, not user documentation. Start with the root
[`README.md`](../README.md) for what the project is and how to run it, and with
[`prisma/schema.prisma`](../prisma/schema.prisma) for how it is modelled — the
schema carries the reasoning for most of the decisions here.

| File | What it is |
|---|---|
| [`BUILD-REPORT.md`](BUILD-REPORT.md) | A build-and-operate report: what was changed in a working session, what was measured, and how to run and extend it afterwards. |
| [`work-report.md`](work-report.md) | A longer running record — what changed, why, **what was tried and rejected**, and operating guides for the parts that need operating. |

Both are point-in-time records. Where one disagrees with the code, the code is
right — these say *why* something was done, and the schema and the `check:`
suites say *what is true now*.
