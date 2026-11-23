import { z } from "zod";

export const identifier = z.string().min(1).refine(value => value.isWellFormed(), "Use well-formed Unicode.");
const text = z.string().min(1);
const status = z.enum(["ok", "warn", "error"]);
const scalar = z.union([z.string(), z.number(), z.boolean()]);
const node = z.object({
  id: identifier,
  type: z.enum(["trigger", "condition", "action", "human"]),
  label: text,
  status,
  badge: z.string().optional(),
  icon: z.string().optional(),
});
const edge = z.object({ from: identifier, to: identifier, label: z.string().optional() });
const clause = z.object({
  field: identifier,
  op: z.enum([
    "eq",
    "neq",
    "in",
    "notIn",
    "contains",
    "matches",
    "gt",
    "lt",
    "lookalikeOf",
  ]),
  value: z.union([scalar, z.array(z.union([z.string(), z.number()]))]),
});
const rule = z.object({
  id: identifier,
  nodeId: identifier,
  name: text,
  enabled: z.boolean(),
  when: z.array(clause),
  then: z.object({
    action: identifier,
    params: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const WorkflowSchema = z
  .object({
    id: identifier,
    name: text,
    status,
    nodes: z.array(node),
    edges: z.array(edge),
    rules: z.array(rule),
  })
  .superRefine((workflow, ctx) => {
    function issue(path: (string | number)[], message: string) {
      ctx.addIssue({ code: "custom", path, message });
    }
    function collectIds(key: "nodes" | "rules") {
      const ids = new Set<string>();
      for (const [index, entry] of workflow[key].entries()) {
        if (ids.has(entry.id)) {
          issue([key, index, "id"], `Duplicate ID: ${entry.id}`);
        }
        ids.add(entry.id);
      }
      return ids;
    }
    const nodes = collectIds("nodes");
    collectIds("rules");
    if (!workflow.nodes.some((entry) => entry.type === "trigger")) {
      issue(["nodes"], "A workflow needs a trigger.");
    }
    function checkNode(target: string, path: (string | number)[]) {
      if (!nodes.has(target)) {
        issue(path, `Unknown node: ${target}`);
      }
    }
    workflow.edges.forEach((entry, index) => {
      checkNode(entry.from, ["edges", index, "from"]);
      checkNode(entry.to, ["edges", index, "to"]);
    });
    workflow.rules.forEach((entry, index) => {
      checkNode(entry.nodeId, ["rules", index, "nodeId"]);
    });
  });

export const WorkflowItemSchema = z.unknown().refine(
  value => value === null || typeof value !== "object" || !Object.hasOwn(value, "__proto__"),
  "The item field __proto__ is unsupported."
).pipe(z.record(
  z.string(),
  z.union([scalar, z.array(z.string())])
));
export const SampleItemSchema = z.object({
  id: identifier,
  label: text,
  description: text,
  item: WorkflowItemSchema,
});
export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowItem = z.infer<typeof WorkflowItemSchema>;
export type Item = WorkflowItem;
export type SampleItem = z.infer<typeof SampleItemSchema>;

export function parseWorkflow(input: unknown): Workflow {
  return WorkflowSchema.parse(input);
}

export function validateWorkflow(input: unknown) {
  return WorkflowSchema.safeParse(input);
}
