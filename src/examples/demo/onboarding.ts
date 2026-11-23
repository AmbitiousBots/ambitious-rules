import { branch, demoWorkflow, edge, node, sample } from "../seedData.ts";

export const onboarding = demoWorkflow(
  "customer-onboarding",
  "Customer onboarding",
  [
    node("signup", "trigger", "Receive signup", "user-plus"),
    node("identity", "condition", "Check identity verification", "shield"),
    node("hold", "human", "Investigate an unverified signup", "user", "error"),
    node("details", "condition", "Check account details", "check"),
    node(
      "request",
      "action",
      "Request missing details",
      "mail",
      "warn",
      "5 waiting"
    ),
    node("create", "action", "Create the account", "user-plus"),
    node("handoff", "condition", "Check setup preference", "calendar"),
    node("assisted", "human", "Arrange guided setup", "user", "warn"),
    node("welcome", "action", "Send the welcome guide", "mail"),
  ],
  [
    edge("signup", "identity"),
    edge("identity", "hold", "else"),
    edge("details", "request", "else"),
    edge("create", "handoff"),
    edge("handoff", "welcome", "else"),
    branch("identity", "details", "Identity verified", [
      "verified",
      "eq",
      true,
    ]),
    branch("details", "create", "Account details complete", [
      "detailsComplete",
      "eq",
      true,
    ]),
    branch("handoff", "assisted", "Guided setup requested", [
      "setup",
      "eq",
      "guided",
    ]),
  ]
);
export const onboardingSamples = [
  sample("Unverified signup", "The signup failed identity verification.", {
    verified: false,
  }),
  sample(
    "Missing details",
    "A verified customer still needs to provide account details.",
    { verified: true, detailsComplete: false }
  ),
  sample("Guided setup", "A verified customer requests help with setup.", {
    verified: true,
    detailsComplete: true,
    setup: "guided",
  }),
  sample(
    "Independent setup",
    "A verified customer chooses the self-service guide.",
    { verified: true, detailsComplete: true, setup: "self" }
  ),
];
