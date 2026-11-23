import { createHash } from "node:crypto";
import type { Db } from "@ambitious/kit/db/open-db";
import { failure } from "@ambitious/kit/domain/failure";
import { isRecord, type JsonObject, type JsonValue } from "@ambitious/kit/domain/json";
import { canonicalJson } from "../domain/encoding.ts";

export const hash = (text: string): string => createHash("sha256").update(text).digest("hex");

export function storedText(value: unknown): string {
  if (typeof value === "string") return value;
  throw failure("E_DB", "A stored text field is invalid.", "Run selfcheck and check your database backup.");
}

export function storedObject(value: unknown): JsonObject {
  const parsed: JsonValue = JSON.parse(storedText(value));
  if (isRecord(parsed)) return parsed;
  throw failure("E_DB", "A stored JSON object is invalid.", "Run selfcheck and check your database backup.");
}

export function withReceipt(db: Db, command: string, input: { idem_key?: string | undefined },
  work: () => JsonObject): JsonObject {
  const key = input.idem_key;
  if (key === undefined) return work();
  const digest = hash(canonicalJson({ command, input }));
  const row = db.prepare("SELECT request_hash, response FROM receipts WHERE idem_key = ?").get(key);
  if (row) {
    if (row.request_hash !== digest)
      throw failure("E_IDEMPOTENCY", "This key belongs to a different request.", "Use a fresh key for this change.");
    return storedObject(row.response);
  }
  const data = work();
  db.prepare("INSERT INTO receipts VALUES (?, ?, ?)").run(key, digest, JSON.stringify(data));
  return data;
}
