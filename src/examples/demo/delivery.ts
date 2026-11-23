import { branch, demoWorkflow, edge, node, sample } from "../seedData.ts";

export const delivery = demoWorkflow(
  "software-delivery",
  "Software delivery",
  [
    node("revision", "trigger", "Receive a revision", "git-merge"),
    node("machine", "condition", "Check the CI machine", "shield"),
    node("ci", "action", "Run CI", "check"),
    node("gate", "condition", "Check merge gate requirements", "shield"),
    node("blocked", "action", "Block the revision", "alert", "error"),
    node(
      "hold-main",
      "action",
      "Wait for main to recover",
      "alert",
      "error",
      "Blocked: main red"
    ),
    node("merge", "action", "Merge through the gate", "git-merge"),
    node("approval", "condition", "Check owner approval", "shield"),
    node(
      "request",
      "human",
      "Request owner approval",
      "user",
      "warn",
      "Deploy approval"
    ),
    node("deploy", "action", "Deploy to production", "check"),
    node("smoke", "condition", "Check deployment smoke tests", "shield"),
    node("release", "action", "Record a successful release", "check"),
    node("rollback", "action", "Roll back the deployment", "alert", "error"),
  ],
  [
    edge("revision", "machine"),
    edge("machine", "blocked", "else"),
    edge("ci", "gate"),
    edge("gate", "blocked", "else"),
    edge("merge", "approval"),
    edge("approval", "request", "else"),
    edge("deploy", "smoke"),
    edge("smoke", "rollback", "else"),
    branch("machine", "ci", "Owner-approved CI machine", [
      "ciMachine",
      "in",
      ["runner-a", "runner-b"],
    ]),
    branch("gate", "hold-main", "Main is red", ["mainStatus", "eq", "red"]),
    branch(
      "gate",
      "merge",
      "Revision cleared for merge",
      ["ciPassed", "eq", true],
      ["reviewOnExactHead", "eq", true],
      ["viaMergeGate", "eq", true],
      ["mainStatus", "eq", "green"]
    ),
    branch("approval", "deploy", "Owner approved deployment", [
      "ownerApproved",
      "eq",
      true,
    ]),
    branch("smoke", "release", "Production smoke tests passed", [
      "smokePassed",
      "eq",
      true,
    ]),
  ]
);
const ready = {
  ciMachine: "runner-a",
  ciPassed: true,
  reviewOnExactHead: true,
  viaMergeGate: true,
  mainStatus: "green",
  ownerApproved: true,
  smokePassed: true,
};
export const deliverySamples = [
  sample(
    "Reviewed revision",
    "The reviewed revision passes every release check.",
    { ...ready }
  ),
  sample(
    "Unapproved runner",
    "CI was requested on a machine outside the owner’s list.",
    { ...ready, ciMachine: "runner-c" }
  ),
  sample("Failing CI", "The revision fails its CI checks.", {
    ...ready,
    ciPassed: false,
  }),
  sample("Outdated review", "The review covers an earlier revision.", {
    ...ready,
    reviewOnExactHead: false,
  }),
  sample("Direct merge request", "The merge request bypasses the merge gate.", {
    ...ready,
    viaMergeGate: false,
  }),
  sample("Main is red", "The main branch has failing checks.", {
    ...ready,
    mainStatus: "red",
  }),
  sample(
    "Awaiting approval",
    "The owner has yet to approve production deployment.",
    { ...ready, ownerApproved: false }
  ),
  sample(
    "Failed smoke test",
    "Production smoke checks fail after deployment.",
    { ...ready, smokePassed: false }
  ),
];
