import { test } from "node:test";
import { features } from "../verify/feature.ts";
import { scratch } from "./cli-helper.ts";

for (const [name, check] of Object.entries(features)) {
  test(name, t => check(scratch(t)));
}
