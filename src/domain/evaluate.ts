import { checkClause } from "./checkClause.ts";
import type { Workflow, WorkflowItem } from "./schema.ts";

type Node = Workflow["nodes"][number];
type Edge = Workflow["edges"][number];
interface Step {
  nodeId: string;
  passed: boolean;
  reason: string;
  ruleId?: string;
}
export interface Evaluation {
  outcome: {
    nodeId: string;
    action: string;
    label: string;
    status: Workflow["status"];
    summary: string;
  };
  path: string[];
  steps: Step[];
}

function selectBranch(
  node: Node,
  rules: Workflow["rules"],
  edges: Edge[],
  item: WorkflowItem,
  steps: Step[]
) {
  const fallback =
    edges.find((edge) => edge.label === "else") ??
    edges.find((edge) => edge.label === undefined);
  const failures: string[] = [];
  for (const rule of rules) {
    if (rule.nodeId !== node.id) {
      continue;
    }
    const ids = { nodeId: node.id, ruleId: rule.id };
    if (!rule.enabled) {
      steps.push({
        ...ids,
        passed: false,
        reason: `${rule.name} is disabled.`,
      });
      continue;
    }
    const checks = rule.when.map((clause) => checkClause(clause, item));
    const passed = checks.every((check) => check.passed);
    const reason =
      checks.map((check) => check.reason).join(". ") || "No checks required.";
    steps.push({ ...ids, passed, reason });
    if (!passed) {
      failures.push(
        checks
          .filter((check) => !check.passed)
          .map((check) => check.reason)
          .join(". ")
      );
      continue;
    }
    const branch = edges.find((edge) => edge.label === rule.then.action);
    if (!branch && fallback) {
      steps.push({
        nodeId: node.id,
        passed: true,
        reason: `No edge labeled ${rule.then.action}. Taking the default branch.`,
      });
    }
    return branch ?? fallback;
  }
  steps.push({
    nodeId: node.id,
    passed: false,
    reason: [
      "No rule matched.",
      ...failures,
      fallback && "Taking the default branch.",
    ]
      .filter(Boolean)
      .join(" "),
  });
  return fallback;
}

export function evaluate(workflow: Workflow, item: WorkflowItem): Evaluation {
  const path: string[] = [];
  const steps: Step[] = [];
  const visited = new Set<string>();
  const nodes = new Map(workflow.nodes.map((entry) => [entry.id, entry]));
  let node = workflow.nodes.find((entry) => entry.type === "trigger");

  function stop(nodeId: string, label: string, summary: string): Evaluation {
    steps.push({ nodeId, passed: false, reason: summary });
    return {
      path,
      steps,
      outcome: { nodeId, label, status: "error", action: "stopped", summary },
    };
  }
  while (node) {
    path.push(node.id);
    visited.add(node.id);
    const { id: nodeId, label, status } = node;
    const edges = workflow.edges.filter((entry) => entry.from === nodeId);
    let edge: Edge | undefined;
    if (node.type === "condition") {
      edge = selectBranch(node, workflow.rules, edges, item, steps);
      if (!edge) {
        return stop(nodeId, label, `No outgoing branch applies at ${label}.`);
      }
    } else {
      if (edges.length > 1) {
        return stop(nodeId, label, `${label} has more than one next step.`);
      }
      const summary =
        node.type === "human" ? `Needs a person: ${label}.` : label;
      steps.push({ nodeId, passed: true, reason: summary });
      [edge] = edges;
      if (!edge) {
        return {
          path,
          steps,
          outcome: { nodeId, action: nodeId, label, status, summary },
        };
      }
    }
    if (visited.has(edge.to)) {
      return stop(
        nodeId,
        label,
        `Stopped before revisiting ${nodes.get(edge.to)?.label ?? edge.to}.`
      );
    }
    node = nodes.get(edge.to);
  }
  return stop(workflow.id, workflow.name, "No workflow node to visit.");
}
