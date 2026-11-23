import { lookalikeOf } from "./lookalike.ts";
import type { Workflow, WorkflowItem } from "./schema.ts";

type Clause = Workflow["rules"][number]["when"][number];
type Value = Clause["value"];
type Actual = WorkflowItem[string];

const labels = new Map(
  Object.entries({
    amount: "Invoice amount",
    language: "Language detected",
    senderDomain: "Sender domain",
    ciMachine: "CI machine",
    reviewOnExactHead: "Independent review on this revision",
    mainStatus: "Main branch status",
    daysUntilDue: "Days until the deadline",
  })
);
const wordBreak = /(?<=[a-z])(?=[A-Z])/gu;

function display(value: Value | Actual): string {
  return Array.isArray(value) ? `[${value.join(", ")}]` : String(value);
}

function contains(actual: Actual, value: Value) {
  if (typeof value === "string") {
    if (typeof actual === "string") {
      return actual.toLowerCase().includes(value.toLowerCase());
    }
    if (Array.isArray(actual)) {
      return actual.includes(value);
    }
  }
}

function matches(actual: Actual, value: Value) {
  if (typeof actual === "string" && typeof value === "string") {
    try {
      return new RegExp(value, "iu").test(actual);
    } catch {
      return "invalid regex";
    }
  }
}

function equal(actual: Actual, value: Value): boolean {
  if (Array.isArray(actual) && Array.isArray(value)) {
    return (
      actual.length === value.length &&
      actual.every((entry, i) => entry === value[i])
    );
  }
  return actual === value;
}

function test({ op, value }: Clause, actual: Actual) {
  switch (op) {
    case "eq":
    case "neq":
      return equal(actual, value) === (op === "eq");
    case "in":
    case "notIn":
      if (!Array.isArray(value) || Array.isArray(actual)) {
        return;
      }
      return value.some((entry) => entry === actual) === (op === "in");
    case "contains":
      return contains(actual, value);
    case "gt":
    case "lt":
      if (typeof actual !== "number" || typeof value !== "number") {
        return;
      }
      return op === "gt" ? actual > value : actual < value;
    case "lookalikeOf":
      return typeof actual === "string" && Array.isArray(value)
        ? lookalikeOf(actual, value)
        : undefined;
    case "matches":
      return matches(actual, value);
    default:
      return op satisfies never;
  }
}

const phrases = {
  eq: ["equals", "differs from"],
  neq: ["differs from", "equals"],
  in: ["in", "outside"],
  notIn: ["outside", "in"],
  contains: ["contains", "does not contain"],
  gt: ["over", "at or below"],
  lt: ["under", "at or above"],
  matches: ["matches", "does not match"],
  lookalikeOf: ["resembles a different entry in", "has no lookalike in"],
} satisfies Record<Clause["op"], [string, string]>;

export function checkClause(clause: Clause, item: WorkflowItem) {
  const { field, op, value } = clause;
  const label = labels.get(field) ?? field.replace(wordBreak, " ");
  const actual = item[field];
  if (actual === undefined || !Object.hasOwn(item, field)) {
    return { passed: false, reason: `${label} is missing` };
  }
  const passed = test(clause, actual);
  if (passed === "invalid regex") {
    return {
      passed: false,
      reason: `${label}: ${display(actual)}. Invalid regex: ${display(value)}`,
    };
  }
  const phrase =
    typeof passed === "boolean"
      ? phrases[op][passed ? 0 : 1]
      : `incompatible with ${op}`;
  return {
    passed: passed === true,
    reason: `${label}: ${display(actual)} (${phrase} ${display(value)})`,
  };
}
