import { isRecord } from "@ambitious/kit/domain/json";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) => isRecord(part)
    ? Object.fromEntries(Object.keys(part).sort().map(key => [key, part[key]]))
    : part);
}
