import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate } from "../src/domain/evaluate.ts";
import { SampleItemSchema, parseWorkflow } from "../src/domain/schema.ts";
import { SAMPLE_ITEMS, SEED_WORKFLOWS } from "../src/examples/seeds.ts";

const expected: Record<string, Record<string, string>> = {
  "inbound-email-routing": {
    "routine-invoice": "pay",
    "invoice-at-the-limit": "pay",
    "large-invoice": "review",
    "new-vendor": "review",
    "sales-inquiry": "notify",
    "weekly-update": "digest",
    receipt: "archive",
    "unreadable-attachment": "hold",
  },
  "email-anti-phishing": {
    "language-review": "inspect",
    "external-payroll-request": "alert",
    "imitation-vendor": "block",
    "known-vendor": "deliver",
  },
  "software-delivery": {
    "reviewed-revision": "release",
    "unapproved-runner": "blocked",
    "failing-ci": "blocked",
    "outdated-review": "blocked",
    "direct-merge-request": "blocked",
    "main-is-red": "hold-main",
    "awaiting-approval": "request",
    "failed-smoke-test": "rollback",
  },
  "customer-onboarding": {
    "unverified-signup": "hold",
    "missing-details": "request",
    "guided-setup": "assisted",
    "independent-setup": "welcome",
  },
  "compliance-deadlines": {
    "completed-filing": "archive",
    "overdue-filing": "escalate",
    "due-today": "remind",
    "thirty-days-left": "remind",
    "future-filing": "monitor",
    "missing-due-date": "verify",
  },
  "scheduling-requests": {
    "priority-guest": "coordinate",
    "external-guest": "coordinate",
    "calendar-conflict": "alternatives",
    "after-hours": "alternatives",
    "available-slot": "confirm",
    "unavailable-calendar": "repair",
  },
};

test("the six fixture catalogs cover every route and rule", () => {
  assert.deepEqual(SEED_WORKFLOWS.map(w => w.id).sort(), Object.keys(expected).sort());
  for (const workflow of SEED_WORKFLOWS) {
    assert.equal(parseWorkflow(workflow).id, workflow.id);
    const samples = SAMPLE_ITEMS[workflow.id] ?? [];
    const actions = expected[workflow.id] ?? {};
    assert.deepEqual(samples.map(s => s.id).sort(), Object.keys(actions).sort());
    const edges = new Set<string>();
    const rules = new Set<string>();
    for (const sample of samples) {
      const { item } = SampleItemSchema.parse(sample);
      const trace = evaluate(workflow, item);
      assert.equal(trace.outcome.action, actions[sample.id], sample.id);
      trace.path.slice(1).forEach((to, i) => edges.add(JSON.stringify([trace.path[i], to])));
      for (const step of trace.steps) if (step.passed && step.ruleId) rules.add(step.ruleId);
    }
    assert.deepEqual(edges, new Set(workflow.edges.map(e => JSON.stringify([e.from, e.to]))));
    assert.deepEqual(rules, new Set(workflow.rules.map(r => r.id)));
  }
});
