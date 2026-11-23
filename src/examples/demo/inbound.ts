import { branch, demoWorkflow, edge, node, sample } from "../seedData.ts";

export const inbound = demoWorkflow(
  "inbound-email-routing",
  "Inbound email routing",
  [
    node("receive", "trigger", "Receive mail", "mail"),
    node("classify", "condition", "Classify the message", "mail"),
    node("invoice", "condition", "Check vendor and invoice limit", "dollar"),
    node("pay", "action", "Process the invoice", "check"),
    node("review", "human", "Review the invoice", "user", "warn", "2 need you"),
    node("assign", "action", "Assign a sales rep", "user-plus"),
    node("notify", "action", "Notify the assigned rep", "mail"),
    node("digest", "action", "Include in the digest", "clock"),
    node("archive", "action", "Archive the message", "check"),
    node("hold", "human", "Inspect unreadable mail", "alert", "error"),
  ],
  [
    edge("receive", "classify"),
    edge("classify", "archive", "else"),
    edge("assign", "notify"),
    edge("invoice", "review", "else"),
    branch("classify", "hold", "Unreadable content", [
      "unreadable",
      "eq",
      true,
    ]),
    branch("classify", "invoice", "Invoice", ["category", "eq", "invoice"]),
    branch("classify", "assign", "Sales inquiry", ["category", "eq", "lead"]),
    branch("classify", "digest", "Digest requested", ["digest", "eq", true]),
    branch(
      "invoice",
      "pay",
      "Known vendor within limit",
      ["knownVendor", "eq", true],
      ["amount", "lt", 1000]
    ),
    branch(
      "invoice",
      "pay",
      "Known vendor at limit",
      ["knownVendor", "eq", true],
      ["amount", "eq", 1000]
    ),
  ]
);
export const inboundSamples = [
  sample("Routine invoice", "A known vendor sends an invoice for 450.", {
    category: "invoice",
    knownVendor: true,
    amount: 450,
  }),
  sample("Invoice at the limit", "A known vendor bills exactly 1000.", {
    category: "invoice",
    knownVendor: true,
    amount: 1000,
  }),
  sample("Large invoice", "A known vendor bills 1200 against a 1000 limit.", {
    category: "invoice",
    knownVendor: true,
    amount: 1200,
  }),
  sample(
    "New vendor",
    "The sender of a small invoice is absent from the vendor list.",
    { category: "invoice", knownVendor: false, amount: 85 }
  ),
  sample("Sales inquiry", "A prospective customer asks for a quote.", {
    category: "lead",
  }),
  sample(
    "Weekly update",
    "An informational message is marked for the digest.",
    { category: "other", digest: true }
  ),
  sample("Receipt", "A receipt arrives with no follow-up requested.", {
    category: "other",
  }),
  sample(
    "Unreadable attachment",
    "The message contains an unreadable invoice.",
    { unreadable: true, category: "invoice" }
  ),
];
