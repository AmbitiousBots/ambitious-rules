import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkflowItem } from "../src/domain/schema.ts";
import { evaluate } from "../src/domain/evaluate.ts";
import { fixture, type Clause } from "./fixture.ts";

type Case = [Clause["op"], Clause["value"], WorkflowItem[string], boolean];
const cases: Case[] = [
    ["eq", "English", "English", true],
    ["eq", "English", "english", false],
    ["eq", false, false, true],
    ["eq", ["one", "two"], ["one", "two"], true],
    ["neq", ["one", "two"], ["two", "one"], true],
    ["eq", 0, "0", false],
    ["neq", "English", "Japanese", true],
    ["neq", 0, 0, false],
    ["in", [1, "two"], 1, true],
    ["in", [1, "two"], "1", false],
    ["notIn", ["office"], "home", true],
    ["notIn", ["office"], "office", false],
    ["notIn", "home", "office", false],
    ["contains", "PAY", "Request payroll", true],
    ["contains", "pay", ["payroll"], false],
    ["contains", "pay", ["pay", "tax"], true],
    ["contains", "Pay", ["pay"], false],
    ["matches", "^invoice [0-9]+$", "Invoice 10", true],
    ["matches", "^invoice$", "invoice 10", false],
    ["gt", 1000, 1200, true],
    ["gt", 1000, 1000, false],
    ["gt", 1000, "1200", false],
    ["lt", 0, -1, true],
    ["lt", 0, 0, false],
    ["lt", "1", 0, false],
    ["lookalikeOf", ["example.org"], "examp1e.org", true],
    ["lookalikeOf", ["example.org"], "𝕒𝕓example.org", true],
    ["lookalikeOf", ["mammal.example"], "rnarnrnal.example", true],
    ["lookalikeOf", ["vendor-a.example"], "vendxx-a.example", true],
    ["lookalikeOf", ["vendor-a.example"], "vxxxor-a.example", false],
    ["lookalikeOf", ["vendor-a.example"], "vendor.example", true],
    ["lookalikeOf", ["vendor.example"], "vendor-a.example", true],
    [
      "lookalikeOf",
      ["vendor-a.example", "vendor-b.example"],
      "VENDOR-B.EXAMPLE",
      false,
    ],
    ["lookalikeOf", ["vendor-a.example"], "example.org", false],
  ];

for (const [op, value, actual, passed] of cases) {
  test(`${op} with ${JSON.stringify(value)} on ${JSON.stringify(actual)} passes = ${passed}`, () => {
    const trace = evaluate(fixture({ field: "field", op, value }), { field: actual });
    assert.deepEqual(trace.path, ["start", "decide", passed ? "accept" : "review"]);
    assert.equal(trace.steps.find(step => step.ruleId === "decide-yes")?.passed, passed);
  });
}

test("each operator fails on missing and inherited fields", () => {
  for (const [op] of cases) {
    const result = evaluate(fixture({ field: "constructor", op, value: "anything" }), {});
    assert.equal(result.outcome.action, "review");
    assert.equal(result.steps.find(step => step.ruleId)?.reason, "constructor is missing");
  }
});

test("invalid patterns produce a failed clause with its reason", () => {
  const result = evaluate(fixture({ field: "subject", op: "matches", value: "(" }), { subject: "Invoice" });
  assert.equal(result.outcome.action, "review");
  assert.equal(result.steps.find(step => step.ruleId)?.reason, "subject: Invoice. Invalid regex: (");
});

test("unsupported regex syntax and oversized patterns fail the clause", () => {
  for (const value of ["(?=item)", "(item)\\1", "x".repeat(1025)]) {
    const trace = evaluate(fixture({ field: "ciMachine", op: "matches", value }), { ciMachine: "item" });
    assert.equal(trace.outcome.action, "review");
    assert.equal(trace.steps.find(step => step.ruleId)?.reason, `ci Machine: item. Invalid regex: ${value}`);
  }
});
