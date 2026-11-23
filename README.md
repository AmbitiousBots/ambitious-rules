# ambitious-rules

Ambitious Rules lets a bot edit a workflow, test which route an item takes, and explain the result. Each saved definition has a version. A recorded evaluation can be replayed against the definition that produced it.

## Run locally

Use Node 24. From a checkout, run `npm ci` and `npm run build`. Try the deadline workflow in a temporary directory.

```sh
export AMBITIOUS_HOME="$(mktemp -d)"
rules() { node dist/ambitious-rules.mjs "$@"; }
rules selfcheck
rules seed
printf '%s\n' '{"workflow_id":"compliance-deadlines","item":{"daysUntilDue":0},"record":true,"idem_key":"deadline-example"}' | rules evaluate
printf '%s\n' '{"id":1}' | rules trace get
```

The item takes the reminder branch. The trace includes the observed number of days, the comparison that matched, and the numbered version used.

A release consists of `ambitious-rules-0.1.0.mjs` and `SHA256SUMS`. Run `shasum -a 256 -c SHA256SUMS` beside the downloaded binary. The release runs with Node alone. On a bot computer, `ambitious-modules sync` installs releases pinned by that bot's template. For an exact release on a computer you control, use the kit's checksum-verified `ambitious-install`. See the [module contract](MODULE_CONTRACT.md).

## Commands

Pass a JSON object on stdin or with `--in file.json`. Use `--db` to select a database. Fix `--now` and `--seed` to reproduce stdout bytes on the same database state. Each command prints one JSON envelope with `ok`, `schemaVersion`, `module`, `command`, `data`, `errors` and `meta`. Exit codes are 0 for success, 1 for caller errors and 2 for database or internal errors.

| Command | Access | Input | Result in `data` |
| --- | --- | --- | --- |
| `commands` | read (no database) | none | Command names, access and input requirements |
| `selfcheck` | write | none | Runtime, binary hash, database integrity, migrations and problems |
| `workflow put` | write | `{workflow, idem_key?, actor?}` | `workflow_id, version, changed` |
| `workflow get` | read | `{id, version?}` | Definition under `workflow`, version, actor, time and command |
| `workflow list` | read | none | Current `workflows`, ordered by ID |
| `workflow history` | read | `{id}` | `versions` in ascending version order, with actor, time and command |
| `rule set` | write | `{workflow_id, rule, idem_key?, actor?}` | Saved version and change flag |
| `rule enable` | write | `{workflow_id, rule_id, idem_key?, actor?}` | Saved version and change flag |
| `rule disable` | write | `{workflow_id, rule_id, idem_key?, actor?}` | Saved version and change flag |
| `evaluate` | read by default, write with `record:true` | `{workflow_id or workflow, item, version?, record?, idem_key?}` | `path, steps, outcome` |
| `trace list` | read | `{workflow_id?, limit?}` | Newest `traces` first, including IDs and outcomes. Default 50, range 1–1000 |
| `trace get` | read | `{id}` | Full `trace` by integer ID |
| `seed` | write | `{idem_key?, actor?}` | Created IDs and number skipped |

`workflow get` and stored `evaluate` default to the latest version. Inline previews can run before `selfcheck`. Database reads use read-only connections and require a current schema. Writes migrate first. Each change and its optional retry receipt commit in one transaction. Use one `idem_key` per intended write and reuse it for retries. A retry returns the original data, including after later edits. An unchanged definition keeps its version. Object key order has no effect on equality. Array order matters. The default actor is `caller`.

`rule set` replaces a rule with the same ID in place or appends a new rule. Use `workflow put` to reorder rules. `seed` inserts only missing workflows. The six examples cover inbound email routing, anti-phishing, software delivery, customer onboarding, compliance deadlines and scheduling. Sample items live beside the [definitions](src/examples/demo).

## Workflow format

The [schema](src/domain/schema.ts) defines `Workflow`, `WorkflowItem` and the validation functions. A minimal definition with one ordered branch looks like this.

```json
{
  "id": "routing", "name": "Route an item", "status": "ok",
  "nodes": [
    {"id":"start","type":"trigger","label":"Receive item","status":"ok"},
    {"id":"check","type":"condition","label":"Check priority","status":"ok"},
    {"id":"review","type":"human","label":"Review item","status":"warn"},
    {"id":"queue","type":"action","label":"Queue item","status":"ok"}
  ],
  "edges": [{"from":"start","to":"check"},{"from":"check","to":"review","label":"review"},{"from":"check","to":"queue","label":"else"}],
  "rules": [{"id":"priority","nodeId":"check","name":"High priority","enabled":true,"when":[{"field":"priority","op":"gt","value":3}],"then":{"action":"review"}}]
}
```

Nodes accept optional `badge` and `icon`. Status is `ok`, `warn` or `error`. Items map field names to strings, numbers, booleans or lists of strings. A clause value is a scalar or a list of strings and numbers. Rule actions may carry a `params` object.

Evaluation starts at the first trigger. At a condition, the first enabled rule whose clauses all pass selects the edge labeled with its action. An empty clause list matches. The fallback is the first edge labeled `else`, followed in preference by the first unlabeled edge. The trace records attempted rules, including disabled rules, with their reasons. A human node with a successor continues the preview. A terminal node returns its ID as the outcome action. A cycle, ambiguous successor or missing route produces a `stopped` outcome with error status.

| Operator | Comparison |
| --- | --- |
| `eq`, `neq` | Compare typed values. Arrays compare element by element in order. |
| `in`, `notIn` | Check scalar membership in a list. |
| `contains` | Case-insensitive substring for strings, exact membership for string arrays. |
| `matches` | Case-insensitive Unicode regular expression. An invalid pattern produces a failed check. |
| `gt`, `lt` | Compare numbers. |
| `lookalikeOf` | Compare a string to known strings using the [lookalike matcher](src/domain/lookalike.ts). An exact case-insensitive match is excluded. |

## Runtime decisions

The [evaluator](src/domain/evaluate.ts) is a pure, synchronous library. A web demo can vendor it and the schema. The handwritten evaluator implements ordered first-match rules, per-clause reasons and `lookalikeOf`. We considered the MIT-licensed `json-rules-engine`. Its asynchronous fact and event model would require an adapter for these semantics. The single-file release bundles the kit and Zod and requires zero separately installed runtime dependencies.

Recording saves the workflow ID, version, item, SHA-256 of its canonical JSON, path, steps, outcome and time. Numbered versions reference immutable definitions. An inline recording saves the submitted definition in the trace and uses `sha256:<digest>` as its version. A numbered `version` input requires `workflow_id`. An inline recording leaves saved workflows untouched. With `record:true`, an optional `idem_key` makes the append safe to retry.

## Local vs hosted

Each bot computer runs its own binary and database and forms the tenant boundary. The default database is `$AMBITIOUS_HOME/rules/rules.sqlite`, with `AMBITIOUS_HOME` defaulting to `/workspace/ambitious`. The kit refuses paths under `/home/box/agent-data/`. This release has no UI, scheduler, hosted service or network calls.

Durable execution is planned for a separate Vercel Workflow SDK runner using Local World. In that design, `@workflow/world-local` owns runs, steps, events, retries and human waits in `.workflow-data/world.db` through `node:sqlite`. That second database belongs in a separate process because the module contract permits one SQLite file per module. The rules database holds definitions, versions, evaluation traces and write receipts. Evaluating an item selects and explains a route. Executing its actions belongs to the runner.

## Module errors

| Code | Exit | Meaning | Typical hint |
| --- | --- | --- | --- |
| `E_NOT_FOUND` | 1 | Unknown workflow, version, rule or trace | List workflows, history or traces and select an existing ID. |
| `E_IDEMPOTENCY` | 1 | A key was used for a different request | Choose a fresh key for the new request. |

The [contract](MODULE_CONTRACT.md) lists shared errors, including `E_INPUT_SCHEMA`, `E_FORBIDDEN_PATH` and `E_MIGRATION`. Run `selfcheck` when a read reports a missing or out-of-date database. See [CONTRIBUTING.md](CONTRIBUTING.md) for release checks and [the bot skill](skills/rules-for-bots/SKILL.md) for editing and explaining rules.

Licensed under [Apache-2.0](LICENSE).
