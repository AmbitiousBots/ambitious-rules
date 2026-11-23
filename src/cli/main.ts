import { readCommand, writeCommand } from "@ambitious/kit/cli/command";
import { embedded } from "@ambitious/kit/cli/embedded";
import { withReceipt } from "../db/storage.ts";
import { getTrace, listTraces } from "../db/traces.ts";
import { editVersion, getVersion, history, listWorkflows, saveVersion, seedWorkflows } from "../db/versions.ts";
import { setRule, toggleRule } from "../domain/edit.ts";
import { parseGet, parseHistory, parseListTraces, parsePut, parseSeed, parseSet, parseToggle, parseTrace } from "../domain/requests.ts";
import { SEED_WORKFLOWS } from "../examples/seeds.ts";
import { evaluateCommand } from "./evaluate-command.ts";
import { runModule } from "./shell.ts";

function toggle(enabled: boolean) {
  const command = enabled ? "rule enable" : "rule disable";
  return writeCommand({ input: parseToggle, run: ({ db, input, clock }) =>
    withReceipt(db, command, input, () => editVersion(db, input.workflow_id,
      workflow => toggleRule(workflow, input.rule_id, enabled), command, clock.now().toISOString(), input.actor)) });
}

await runModule({
  ...embedded(),
  schemaVersion: 1,
  commands: {
    "workflow put": writeCommand({ input: parsePut, run: ({ db, input, clock }) =>
      withReceipt(db, "workflow put", input, () => saveVersion(db, input.workflow, "workflow put", clock.now().toISOString(), input.actor)) }),
    "workflow get": readCommand({ input: parseGet, run: ({ db, input }) => getVersion(db, input.id, input.version) }),
    "workflow list": readCommand({ run: ({ db }) => listWorkflows(db) }),
    "workflow history": readCommand({ input: parseHistory, run: ({ db, input }) => history(db, input.id) }),
    "rule set": writeCommand({ input: parseSet, run: ({ db, input, clock }) =>
      withReceipt(db, "rule set", input, () => editVersion(db, input.workflow_id, workflow => setRule(workflow, input.rule),
        "rule set", clock.now().toISOString(), input.actor)) }),
    "rule enable": toggle(true),
    "rule disable": toggle(false),
    evaluate: evaluateCommand(),
    "trace list": readCommand({ input: parseListTraces, run: ({ db, input }) => listTraces(db, input.workflow_id, input.limit) }),
    "trace get": readCommand({ input: parseTrace, run: ({ db, input }) => getTrace(db, input.id) }),
    seed: writeCommand({ input: parseSeed, run: ({ db, input, clock }) =>
      withReceipt(db, "seed", input, () => seedWorkflows(db, SEED_WORKFLOWS, clock.now().toISOString(), input.actor)) }),
  },
}, new Set(["seed", "trace list"]));
