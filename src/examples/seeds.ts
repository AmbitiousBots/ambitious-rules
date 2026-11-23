import { deadlineSamples, deadlines } from "./demo/deadlines.ts";
import { delivery, deliverySamples } from "./demo/delivery.ts";
import { inbound, inboundSamples } from "./demo/inbound.ts";
import { onboarding, onboardingSamples } from "./demo/onboarding.ts";
import { phishing, phishingSamples } from "./demo/phishing.ts";
import { scheduling, schedulingSamples } from "./demo/scheduling.ts";
import type { SampleItem, Workflow } from "../domain/schema.ts";

export const SEED_WORKFLOWS: Workflow[] = [
  inbound,
  phishing,
  delivery,
  onboarding,
  deadlines,
  scheduling,
];
export const SAMPLE_ITEMS: Record<string, SampleItem[]> = {
  [inbound.id]: inboundSamples,
  [phishing.id]: phishingSamples,
  [delivery.id]: deliverySamples,
  [onboarding.id]: onboardingSamples,
  [deadlines.id]: deadlineSamples,
  [scheduling.id]: schedulingSamples,
};
