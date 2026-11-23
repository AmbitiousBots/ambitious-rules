import type { Db } from "@ambitious/kit/db/open-db";
import { failure } from "@ambitious/kit/domain/failure";
import { canonicalJson } from "../domain/encoding.ts";
import { validateWorkflow, type Workflow } from "../domain/schema.ts";
import { storedObject, storedText } from "./storage.ts";

const columns = "workflow_id, version, at, actor, command";

function findVersion(db: Db, id: string, version?: number) {
  return version === undefined
    ? db.prepare(`SELECT * FROM versions WHERE workflow_id = ? ORDER BY version DESC LIMIT 1`).get(id)
    : db.prepare("SELECT * FROM versions WHERE workflow_id = ? AND version = ?").get(id, version);
}

export function getVersion(db: Db, id: string, version?: number) {
  const row = findVersion(db, id, version);
  if (!row) throw failure("E_NOT_FOUND", "The requested workflow or version does not exist.", "Use workflow list and workflow history to find a saved version.");
  return { workflow: storedObject(row.definition), version: Number(row.version), actor: storedText(row.actor),
    at: storedText(row.at), command: storedText(row.command) };
}

export function parseStoredWorkflow(definition: unknown): Workflow {
  const result = validateWorkflow(definition);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = ["workflow", ...(issue?.path ?? [])].join(".");
  throw failure("E_INPUT_SCHEMA", `The stored ${field} is invalid. ${issue?.message ?? "Check the workflow format."}`,
    "Use workflow get to retrieve the definition, correct it, and save a new version with workflow put.");
}

export function saveVersion(db: Db, workflow: Workflow, command: string, at: string, actor = "caller") {
  const previous = findVersion(db, workflow.id);
  const definition = canonicalJson(workflow);
  const changed = previous?.definition !== definition;
  const version = Number(previous?.version ?? 0) + Number(changed);
  if (changed) db.prepare("INSERT INTO versions (workflow_id, version, definition, actor, at, command) VALUES (?, ?, ?, ?, ?, ?)")
    .run(workflow.id, version, definition, actor, at, command);
  return { workflow_id: workflow.id, version, changed };
}

export function editVersion(db: Db, id: string, edit: (workflow: Workflow) => Workflow, command: string, at: string, actor?: string) {
  const current = getVersion(db, id);
  return saveVersion(db, edit(parseStoredWorkflow(current.workflow)), command, at, actor);
}

function summary(row: Record<string, unknown>) {
  return { workflow_id: storedText(row.workflow_id), version: Number(row.version), at: storedText(row.at),
    actor: storedText(row.actor), command: storedText(row.command) };
}

export function listWorkflows(db: Db) {
  const rows = db.prepare(`SELECT ${columns}, definition -> '$.name' AS name,
    json_extract(definition, '$.status') AS status FROM versions v WHERE version =
    (SELECT MAX(version) FROM versions WHERE workflow_id = v.workflow_id) ORDER BY workflow_id`).all();
  return { workflows: rows.map(row => ({ ...summary(row), name: storedText(JSON.parse(storedText(row.name))), status: storedText(row.status) })) };
}

export function history(db: Db, id: string) {
  const rows = db.prepare(`SELECT ${columns} FROM versions WHERE workflow_id = ? ORDER BY version`).all(id);
  if (!rows.length) throw failure("E_NOT_FOUND", "The workflow has no saved versions.", "Use workflow list to find a workflow ID.");
  return { versions: rows.map(summary) };
}

export function seedWorkflows(db: Db, workflows: Workflow[], at: string, actor?: string) {
  const created = workflows.filter(workflow => !findVersion(db, workflow.id))
    .map(workflow => saveVersion(db, workflow, "seed", at, actor).workflow_id);
  return { created, skipped: workflows.length - created.length };
}
