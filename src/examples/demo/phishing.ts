import { branch, demoWorkflow, edge, node, sample } from "../seedData.ts";

export const phishing = demoWorkflow(
  "email-anti-phishing",
  "Email anti-phishing",
  [
    node("receive", "trigger", "Receive mail", "mail"),
    node("screen", "condition", "Apply US mailbox rules", "shield"),
    node(
      "quarantine",
      "action",
      "Quarantine the message",
      "shield",
      "warn",
      "Quarantined: 3"
    ),
    node("inspect", "human", "Review quarantine", "user", "warn"),
    node("flag", "action", "Flag the impersonation request", "alert", "error"),
    node("alert", "human", "Notify the mailbox reviewer", "user", "warn"),
    node("block", "action", "Block the lookalike sender", "shield", "error"),
    node("deliver", "action", "Deliver to the inbox", "mail"),
  ],
  [
    edge("receive", "screen"),
    edge("quarantine", "inspect"),
    edge("flag", "alert"),
    edge("screen", "deliver", "else"),
    branch("screen", "quarantine", "Quarantine non-English mail", [
      "language",
      "neq",
      "English",
    ]),
    branch(
      "screen",
      "flag",
      "External executive asks for financial details",
      ["displayName", "in", ["Chief Executive", "Finance Director"]],
      ["senderDomain", "matches", "^.+(?<!^example\\.com)$"],
      [
        "body",
        "matches",
        "\\b(?:send|share|provide|confirm)\\b[^.!?]*\\b(?:payroll|bank)\\b",
      ]
    ),
    branch("screen", "block", "Domain resembles a vendor", [
      "senderDomain",
      "lookalikeOf",
      ["vendor-a.example"],
    ]),
  ]
);
export const phishingSamples = [
  sample("Language review", "A Japanese message reaches the US mailbox.", {
    language: "Japanese",
  }),
  sample(
    "External payroll request",
    "An outside address uses an executive name to request payroll records.",
    {
      language: "English",
      displayName: "Finance Director",
      senderDomain: "example.org",
      body: "Please send the payroll records.",
    }
  ),
  sample(
    "Imitation vendor",
    "One character in the sender’s domain differs from a known vendor domain.",
    { language: "English", senderDomain: "vend0r-a.example" }
  ),
  sample(
    "Known vendor",
    "A vendor sends an English message from its registered domain.",
    { language: "English", senderDomain: "vendor-a.example" }
  ),
];
