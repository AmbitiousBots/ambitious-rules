import type { Access, Command } from "@ambitious/kit/cli/command";
import { evaluate, type Evaluation } from "../domain/evaluate.ts";
import { evaluateInput, parse } from "../domain/requests.ts";
import { parseWorkflow } from "../domain/schema.ts";
import { withReceipt } from "../db/storage.ts";
import { appendTrace } from "../db/traces.ts";
import { getVersion } from "../db/versions.ts";

const output = (result: Evaluation) => ({ ...result, steps: result.steps.map(step => ({ ...step })) });

export function evaluateCommand(): Command {
  let access: Access = "write";
  return {
    get access() { return access; },
    takesInput: true,
    parse(raw) {
      const input = parse(evaluateInput)(raw);
      const { workflow, workflow_id, version, item, record } = input;
      access = record ? "write" : workflow ? "none" : "read";
      return ({ openDb, clock }) => {
        if (workflow && !record) return output(evaluate(workflow, item));
        const db = openDb();
        const run = () => {
          const stored = workflow_id === undefined ? undefined : getVersion(db, workflow_id, version);
          const definition = workflow ?? parseWorkflow(stored?.workflow);
          const result = evaluate(definition, item);
          if (record) appendTrace(db, definition, stored?.version, item, result, clock.now().toISOString());
          return output(result);
        };
        return record ? withReceipt(db, "evaluate", input, run) : run();
      };
    },
  };
}
