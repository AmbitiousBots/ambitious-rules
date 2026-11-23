import { branch, demoWorkflow, edge, node, sample } from "../seedData.ts";

export const deadlines = demoWorkflow(
  "compliance-deadlines",
  "Compliance deadlines",
  [
    node("check-in", "trigger", "Check filing obligations", "calendar"),
    node("standing", "condition", "Check completion", "check"),
    node("archive", "action", "Archive completed filing", "check"),
    node("deadline", "condition", "Check days remaining", "clock"),
    node("escalate", "human", "Escalate overdue filing", "user", "error"),
    node("monitor", "action", "Keep on the filing calendar", "calendar"),
    node("remind", "action", "Send a filing reminder", "mail", "warn"),
    node("verify", "human", "Request a due date", "user", "warn"),
  ],
  [
    edge("check-in", "standing"),
    edge("standing", "deadline", "else"),
    edge("deadline", "verify", "else"),
    branch("standing", "archive", "Filing completed", [
      "completed",
      "eq",
      true,
    ]),
    branch("deadline", "escalate", "Past due", ["daysUntilDue", "lt", 0]),
    branch("deadline", "monitor", "More than thirty days left", [
      "daysUntilDue",
      "gt",
      30,
    ]),
    branch("deadline", "remind", "Due within thirty days", [
      "daysUntilDue",
      "lt",
      30,
    ]),
    branch("deadline", "remind", "Due in thirty days", [
      "daysUntilDue",
      "eq",
      30,
    ]),
  ]
);
export const deadlineSamples = [
  sample("Completed filing", "The filing was completed before the check.", {
    completed: true,
    daysUntilDue: -1,
  }),
  sample("Overdue filing", "The filing was due yesterday.", {
    daysUntilDue: -1,
  }),
  sample("Due today", "Today is the filing deadline.", {
    daysUntilDue: 0,
  }),
  sample(
    "Thirty days left",
    "The filing enters its thirty-day reminder window.",
    { daysUntilDue: 30 }
  ),
  sample("Future filing", "The filing deadline is thirty-one days away.", {
    daysUntilDue: 31,
  }),
  sample("Missing due date", "An open obligation has no due date.", {
    completed: false,
  }),
];
