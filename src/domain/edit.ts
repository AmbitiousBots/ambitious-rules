import { failure } from "@ambitious/kit/domain/failure";
import { parse } from "./requests.ts";
import { WorkflowSchema, type Workflow } from "./schema.ts";

type Rule = Workflow["rules"][number];
export function setRule(workflow: Workflow, rule: Rule): Workflow {
  const rules = workflow.rules.some(entry => entry.id === rule.id)
    ? workflow.rules.map(entry => entry.id === rule.id ? rule : entry)
    : [...workflow.rules, rule];
  return parse(WorkflowSchema)({ ...workflow, rules });
}

export function toggleRule(workflow: Workflow, id: string, enabled: boolean): Workflow {
  const rule = workflow.rules.find(entry => entry.id === id);
  if (!rule) throw failure("E_NOT_FOUND", "The workflow has no rule with that ID.", "Use workflow get and choose a rule ID.");
  return setRule(workflow, { ...rule, enabled });
}
