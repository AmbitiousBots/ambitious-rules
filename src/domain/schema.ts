import { z } from "zod";

const reservedKeys = new Set(["__proto__", "constructor", "prototype"]);
const maxDepth = 32;
export const maxPatternLength = 1024;

function jsonInput(rootDepth = 1) {
  return z.unknown().superRefine((input, ctx) => {
    const visited = new WeakMap<object, number>();
    const problem = (value: unknown, depth: number): string | undefined => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        return "Use finite numbers in JSON input.";
      }
      if (typeof value === "string" && !value.isWellFormed()) {
        return "Use well-formed Unicode in JSON strings and member names.";
      }
      if (value === null || typeof value !== "object") return;
      if (depth > maxDepth) return `JSON objects and arrays may nest at most ${maxDepth} levels deep.`;
      if ((visited.get(value) ?? 0) >= depth) return;
      visited.set(value, depth);
      for (const [key, child] of Object.entries(value)) {
        if (reservedKeys.has(key)) return `The member name ${key} is reserved.`;
        const issue = problem(key, depth) ?? problem(child, depth + 1);
        if (issue) return issue;
      }
    };
    const message = problem(input, rootDepth);
    if (message) ctx.addIssue({ code: "custom", message });
  });
}

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
}).superRefine(({ op, value }, ctx) => {
  if (op === "matches" && typeof value === "string" && value.length > maxPatternLength)
    ctx.addIssue({ code: "custom", path: ["value"], message: `Use a pattern of at most ${maxPatternLength} UTF-16 code units.` });
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

const workflowDefinition = z
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

const item = z.record(
  z.string(),
  z.union([scalar, z.array(z.string())])
);
export const WorkflowSchema = jsonInput().pipe(workflowDefinition);
const ruleDepthInWorkflow = 3;
export const RuleSchema = jsonInput(ruleDepthInWorkflow).pipe(rule);
export const WorkflowItemSchema = jsonInput().pipe(item);
export const SampleItemSchema = jsonInput().pipe(z.object({
  id: identifier,
  label: text,
  description: text,
  item,
}));
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
