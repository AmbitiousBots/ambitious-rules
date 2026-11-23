import type { Db } from "@ambitious/kit/db/open-db";
import { failure } from "@ambitious/kit/domain/failure";
import { canonicalJson } from "../domain/encoding.ts";
import type { Evaluation } from "../domain/evaluate.ts";
import type { Workflow, WorkflowItem } from "../domain/schema.ts";
import { hash, storedObject, storedText } from "./storage.ts";

export function appendTrace(db: Db, workflow: Workflow, version: number | undefined, item: WorkflowItem, result: Evaluation, at: string) {
  const inline = version === undefined ? canonicalJson(workflow) : null;
  const encoded = canonicalJson(item);
  db.prepare(`INSERT INTO traces (workflow_id, version, inline_definition, inline_hash, item_hash, item, evaluation, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(workflow.id, version ?? null, inline, inline === null ? null : hash(inline),
    hash(encoded), encoded, JSON.stringify(result), at);
}

function summary(row: Record<string, unknown>) {
  return { id: Number(row.id), workflow_id: storedText(row.workflow_id),
    version: row.version === null ? `sha256:${storedText(row.inline_hash)}` : Number(row.version),
    item_hash: storedText(row.item_hash), at: storedText(row.at) };
}

export function listTraces(db: Db, id: string | undefined, limit: number) {
  const columns = "id, workflow_id, version, inline_hash, item_hash, at, json_extract(evaluation, '$.outcome') AS outcome";
  const rows = id === undefined
    ? db.prepare(`SELECT ${columns} FROM traces ORDER BY id DESC LIMIT ?`).all(limit)
    : db.prepare(`SELECT ${columns} FROM traces WHERE workflow_id = ? ORDER BY id DESC LIMIT ?`).all(id, limit);
  return { traces: rows.map(row => ({ ...summary(row), outcome: storedObject(row.outcome) })) };
}

export function getTrace(db: Db, id: number) {
  const row = db.prepare("SELECT * FROM traces WHERE id = ?").get(id);
  if (!row) throw failure("E_NOT_FOUND", "The evaluation trace does not exist.", "Use trace list to find a trace ID.");
  return { trace: { ...summary(row), item: storedObject(row.item), ...storedObject(row.evaluation),
    ...(row.inline_definition === null ? {} : { workflow: storedObject(row.inline_definition) }) } };
}
