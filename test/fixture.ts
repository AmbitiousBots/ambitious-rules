import type { Workflow } from "../src/domain/schema.ts";
import { edge, node, rule } from "../src/examples/seedData.ts";

export type Clause = Workflow["rules"][number]["when"][number];
export function fixture(...clauses: Clause[]): Workflow {
  return {
    id: "routing",
    name: "Routing",
    status: "warn",
    nodes: [
      node("start", "trigger", "Receive item", "mail"),
      node("decide", "condition", "Check item", "shield"),
      node("accept", "action", "Accept item", "check"),
      node("review", "human", "Review item", "user", "warn"),
    ],
    edges: [
      edge("start", "decide"),
      edge("decide", "accept", "yes"),
      edge("decide", "review", "else"),
    ],
    rules: [rule("decide", "yes", "Accept matching items", ...clauses)],
  };
}

export function check(
  field: string,
  op: Clause["op"],
  value: Clause["value"]
): Clause {
  return { field, op, value };
}
