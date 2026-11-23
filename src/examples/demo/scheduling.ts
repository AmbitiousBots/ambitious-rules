import { branch, demoWorkflow, edge, node, sample } from "../seedData.ts";

export const scheduling = demoWorkflow(
  "scheduling-requests",
  "Scheduling requests",
  [
    node("request", "trigger", "Receive meeting request", "calendar"),
    node("requester", "condition", "Check requester", "user"),
    node(
      "coordinate",
      "human",
      "Coordinate the meeting",
      "user",
      "warn",
      "2 need you"
    ),
    node("slot", "condition", "Check the requested time", "clock"),
    node(
      "alternatives",
      "action",
      "Propose alternative times",
      "calendar",
      "warn"
    ),
    node("reserve", "action", "Reserve the requested slot", "calendar"),
    node("confirm", "action", "Send meeting confirmation", "check"),
    node("repair", "human", "Resolve unavailable calendar", "alert", "error"),
  ],
  [
    edge("request", "requester"),
    edge("requester", "slot", "else"),
    edge("slot", "alternatives", "else"),
    edge("reserve", "confirm"),
    branch("requester", "coordinate", "VIP or external requester", [
      "requesterType",
      "in",
      ["VIP", "external"],
    ]),
    branch("slot", "repair", "Calendar unavailable", [
      "calendarOffline",
      "eq",
      true,
    ]),
    branch(
      "slot",
      "reserve",
      "Available during working hours",
      ["conflict", "eq", false],
      ["workingHours", "eq", true]
    ),
  ]
);
export const schedulingSamples = [
  sample("Priority guest", "A priority guest requests a meeting.", {
    requesterType: "VIP",
  }),
  sample("External guest", "An external guest requests a meeting.", {
    requesterType: "external",
  }),
  sample("Calendar conflict", "Another meeting occupies the requested slot.", {
    conflict: true,
    workingHours: true,
  }),
  sample("After hours", "The requested slot falls outside working hours.", {
    conflict: false,
    workingHours: false,
  }),
  sample("Available slot", "The requested time is free during working hours.", {
    conflict: false,
    workingHours: true,
  }),
  sample(
    "Unavailable calendar",
    "The calendar is unavailable for this request.",
    { calendarOffline: true }
  ),
];
