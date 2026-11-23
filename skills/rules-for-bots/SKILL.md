---
name: rules-for-bots
description: Edit workflow rules, preview a route for an item, and explain recorded evaluations using the installed Ambitious Rules CLI.
---

# Drive Ambitious Rules

Run `node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-rules" selfcheck` at routine start. Use the same executable for each command. Send one JSON object on stdin or with `--in`. Read the exit code and envelope. On failure, use the error code and hint. Keep credentials and private bot files out of items and definitions. A recording retains the entire item.

## Edit a rule from a request

For “send items above priority three to review,” use `workflow list` and `workflow get {"id":"routing"}` to locate the condition, existing rules and outgoing edge labels. Check the item field, its type, the threshold and which branch handles a match. Ask for the missing detail if the request could select two different routes.

Preserve the rule ID and its position when editing. Set `when` to `[{"field":"priority","op":"gt","value":3}]` and set `then.action` to the existing review edge label. Build a candidate definition and call `evaluate` with `{workflow,item}` for priorities 3 and 4. Read the returned reasons to check the boundary and whether an earlier rule takes precedence.

Save the complete rule with `rule set {workflow_id,rule,idem_key,actor}`. A new ID appends the rule. Use `workflow put` for an authorized change to edges or rule order. To pause or resume a rule, use `rule disable` or `rule enable` with its workflow and rule IDs. Keep one idempotency key for each intended change, including retries. Report the returned version. Use `workflow history` to identify the actor and time.

## Explain an evaluation

Use `evaluate {workflow_id,item,version?}` for a preview. Add `record:true` and an idempotency key when the user wants an audit entry. Use `trace list {workflow_id,limit}` and `trace get {id}` for a past evaluation. Read the stored definition version for labels, or use the embedded workflow for an inline trace.

Name the outcome, then the rule and observed value that selected it. When the default branch ran, quote the failed check or explain that the rule was disabled. For a stopped route, relay the reason from the final step. Describe a human outcome as work awaiting a person. The evaluator reports a route and performs no external action.

The [command reference](https://github.com/AmbitiousBots/ambitious-rules#commands) covers input and output for every command.
