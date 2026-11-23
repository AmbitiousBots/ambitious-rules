import { checkClause } from "./checkClause.ts";
import { BoundedText, clip, display, maxStepLength } from "./explanation.ts";
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
  addStep: (step: Step) => void
) {
  const fallback =
    edges.find((edge) => edge.label === "else") ??
    edges.find((edge) => edge.label === undefined);
  const failures = new BoundedText(maxStepLength);
  for (const rule of rules) {
    if (rule.nodeId !== node.id) {
      continue;
    }
    const ids = { nodeId: node.id, ruleId: rule.id };
    if (!rule.enabled) {
      addStep({
        ...ids,
        passed: false,
        reason: `${display(rule.name)} is disabled.`,
      });
      continue;
    }
    const explanation = new BoundedText(maxStepLength);
    let passed = true;
    for (const clause of rule.when) {
      const check = checkClause(clause, item);
      if (!check.passed) passed = false;
      explanation.append(check.reason, explanation.text ? ". " : "");
    }
    addStep({ ...ids, passed, reason: explanation.text || "No checks required." });
    if (!passed) {
      failures.append(rule.id, failures.text ? ", " : "");
      continue;
    }
    const branch = edges.find((edge) => edge.label === rule.then.action);
    if (!branch && fallback) {
      addStep({
        nodeId: node.id,
        passed: true,
        reason: `No edge labeled ${display(rule.then.action)}. Taking the default branch.`,
      });
    }
    return branch ?? fallback;
  }
  addStep({
    nodeId: node.id,
    passed: false,
    reason: [
      "No rule matched.",
      fallback && "Taking the default branch.",
      failures.text && `Failed rules: ${failures.text}.`,
    ]
      .filter(Boolean)
      .join(" "),
  });
  return fallback;
}

export function evaluate(workflow: Workflow, item: WorkflowItem): Evaluation {
  const path: string[] = [];
  const steps: Step[] = [];
  const remaining = { rule: 12 * 1024, route: 4 * 1024 };
  function addStep(step: Step) {
    const kind = step.ruleId === undefined ? "route" : "rule";
    const reason = clip(step.reason, Math.min(remaining[kind], maxStepLength));
    remaining[kind] -= reason.length;
    steps.push({ ...step, reason });
  }
  const visited = new Set<string>();
  const nodes = new Map(workflow.nodes.map((entry) => [entry.id, entry]));
  let node = workflow.nodes.find((entry) => entry.type === "trigger");

  function stop(nodeId: string, label: string, summary: string): Evaluation {
    summary = clip(summary, maxStepLength);
    addStep({ nodeId, passed: false, reason: summary });
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
      edge = selectBranch(node, workflow.rules, edges, item, addStep);
      if (!edge) {
        return stop(nodeId, label, `No outgoing branch applies at ${label}.`);
      }
    } else {
      if (edges.length > 1) {
        return stop(nodeId, label, `${label} has more than one next step.`);
      }
      const summary = clip(node.type === "human" ? `Needs a person: ${label}.` : label, maxStepLength);
      addStep({ nodeId, passed: true, reason: summary });
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
