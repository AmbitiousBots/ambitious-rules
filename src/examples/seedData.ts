import type { SampleItem, Workflow, WorkflowItem } from "../domain/schema.ts";

type Node = Workflow["nodes"][number];
type Clause = Workflow["rules"][number]["when"][number];
export function node(
  id: string,
  type: Node["type"],
  label: string,
  icon: string,
  status: Node["status"] = "ok",
  badge?: string
): Node {
  return { id, type, label, icon, status, ...(badge && { badge }) };
}

export function edge(from: string, to: string, label?: string) {
  return { from, to, label };
}

export function sample(
  label: string,
  description: string,
  item: WorkflowItem
): SampleItem {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return { id, label, description, item };
}

export function rule(
  nodeId: string,
  action: string,
  name: string,
  ...when: Clause[]
): Workflow["rules"][number] {
  return {
    id: `${nodeId}-${action.toLowerCase().replaceAll(" ", "-")}`,
    nodeId,
    name,
    enabled: true,
    when,
    then: { action },
  };
}

type Route = Workflow["edges"][number] & { rule?: Workflow["rules"][number] };
export function branch(
  from: string,
  to: string,
  label: string,
  ...checks: [field: string, op: Clause["op"], value: Clause["value"]][]
): Route {
  const when = checks.map(([field, op, value]) => ({ field, op, value }));
  return { from, to, label, rule: rule(from, label, label, ...when) };
}

export function demoWorkflow(
  id: string,
  name: string,
  nodes: Node[],
  routes: Route[]
): Workflow {
  const severity = ["error", "warn", "ok"] as const;
  const status =
    severity.find((level) => nodes.some((n) => n.status === level)) ?? "ok";
  const edges = routes.map(({ from, to, label }) => edge(from, to, label));
  const rules = routes.flatMap((route) => route.rule ?? []);
  return { id, name, status, nodes, edges, rules };
}
