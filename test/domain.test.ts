import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { evaluate } from "../src/domain/evaluate.ts";
import { parseWorkflow, WorkflowItemSchema, type Workflow } from "../src/domain/schema.ts";
import { SEED_WORKFLOWS } from "../src/examples/seeds.ts";
import { edge, node, rule } from "../src/examples/seedData.ts";
import { check, fixture } from "./fixture.ts";

test("rejects duplicate IDs, broken references and a missing trigger", () => {
  const w = fixture();
  for (const patch of [
    { nodes: [...w.nodes, ...w.nodes] }, { rules: [...w.rules, ...w.rules] },
    { edges: [edge("absent", "decide")] }, { edges: [edge("start", "absent")] },
    { rules: [rule("absent", "yes", "Match")] }, { nodes: w.nodes.slice(1) }, { status: "unknown" },
  ]) assert.throws(() => parseWorkflow({ ...w, ...patch }));
  for (const value of [[1], null, { nested: true }]) assert.equal(WorkflowItemSchema.safeParse({ value }).success, false);
});

test("the first enabled match wins and each attempted rule explains its checks", () => {
  const w = fixture();
  w.rules = [
    { ...rule("decide", "skip", "Paused"), enabled: false },
    rule("decide", "fail", "Checks", check("amount", "gt", 1000), check("known", "eq", true)),
    rule("decide", "yes", "Accept"), rule("decide", "else", "Later"),
  ];
  const trace = evaluate(w, { amount: 1200, known: false });
  assert.deepEqual(trace.path, ["start", "decide", "accept"]);
  assert.deepEqual(trace.steps.filter(s => s.ruleId).map(s => [s.ruleId, s.passed, s.reason]), [
    ["decide-skip", false, "Paused is disabled."],
    ["decide-fail", false, "amount: 1200 (over 1000). known: false (differs from true)"],
    ["decide-yes", true, "No checks required."],
  ]);
});

test("else precedes the unlabeled fallback, and a human node can have a successor", () => {
  const w = fixture();
  w.rules = [rule("decide", "other", "Unmapped")];
  w.edges.unshift(edge("decide", "accept"));
  assert.equal(evaluate(w, {}).outcome.summary, "Needs a person: Review item.");
  w.edges.push(edge("review", "accept"));
  assert.deepEqual(evaluate(w, {}).path, ["start", "decide", "review", "accept"]);
  w.edges = w.edges.filter(e => e.label !== "else");
  assert.equal(evaluate(w, {}).outcome.action, "accept");
  w.edges = [edge("start", "decide")];
  assert.equal(evaluate(w, {}).outcome.action, "stopped");
});

test("arbitrary items give identical traces and preserve the input and definition", () => {
  const items = fc.dictionary(fc.string(), fc.oneof(fc.integer(), fc.boolean(), fc.string(), fc.array(fc.string())));
  fc.assert(fc.property(items, item => {
    for (const workflow of SEED_WORKFLOWS) {
      const before = JSON.stringify([workflow, item]);
      assert.deepEqual(evaluate(workflow, item), evaluate(workflow, item));
      assert.equal(JSON.stringify([workflow, item]), before);
    }
  }), { seed: 37, numRuns: 200 });
});

test("connected graphs stop before revisiting any node", () => {
  fc.assert(fc.property(fc.array(fc.nat(30), { minLength: 1, maxLength: 20 }), targets => {
    const workflow: Workflow = { id: "graph", name: "Graph", status: "ok", rules: [],
      nodes: targets.map((_, i) => node(String(i), i === 0 ? "trigger" : "action", String(i), "check")),
      edges: targets.map((target, i) => edge(String(i), String(target % targets.length))) };
    const { path, outcome } = evaluate(workflow, {});
    assert.deepEqual(path, [...new Set(path)]);
    assert.equal(outcome.nodeId, path.at(-1));
    assert.equal(outcome.action, "stopped");
  }), { seed: 7, numRuns: 1000 });
});
