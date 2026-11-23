# Agent guide

Ambitious Rules provides versioned workflow definitions, synchronous evaluation and an append-only local trace. Read [the contract](MODULE_CONTRACT.md), [the command table](README.md#commands) and [the schema](src/domain/schema.ts) before changing behavior.

Keep the evaluator pure and compatible with the published JSON format. Preserve rule and edge order. Put clock and CLI handling in `src/cli`, SQLite access in `src/db`, and optional demo fixtures in `src/examples`. Add a migration for schema changes. A write and its idempotency receipt share a transaction. Read commands open the database read-only.

Model changes to version ordering or retries in `spec`. Add a feature check when the CLI changes. Run `npm run release:check` before proposing a release and include the output of `verify/run`. Record implementation decisions in the pull request. Use generic examples and describe only the behavior enforced by the code.
