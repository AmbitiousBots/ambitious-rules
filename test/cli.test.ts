import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "@ambitious/kit/db/open-db";
import { items, object, run, scratch, success } from "./cli-helper.ts";
import { fixture } from "./fixture.ts";
import { rule } from "../src/examples/seedData.ts";

test("a write key replays its original response after later edits and rejects conflicting requests", t => {
  const home = scratch(t);
  const workflow = fixture();
  const request = { workflow, actor: "editor", idem_key: "create" };
  const first = run(home, "workflow put", request);
  assert.equal(first.status, 0);
  const noChange = { ...request, idem_key: "unchanged" };
  assert.equal(success(home, "workflow put", noChange).changed, false);
  success(home, "workflow put", { workflow: { ...workflow, name: "Changed" } });
  assert.equal(run(home, "workflow put", request).stdout, first.stdout);
  assert.equal(success(home, "workflow put", noChange).version, 1);
  const conflict = run(home, "workflow put", { ...request, actor: "other" });
  assert.equal(conflict.status, 1);
  assert.equal(object(items(conflict.envelope.errors)[0]).code, "E_IDEMPOTENCY");
  const bad = { ...rule("absent", "yes", "Unmapped"), id: "new" };
  assert.equal(run(home, "rule set", { workflow_id: workflow.id, rule: bad, idem_key: "rule" }).status, 1);
  assert.equal(success(home, "rule set", { workflow_id: workflow.id, rule: { ...bad, nodeId: "decide" }, idem_key: "rule" }).version, 3);
  assert.equal(items(success(home, "workflow history", { id: workflow.id }).versions).length, 3);
});

test("stored previews require the current schema and inline previews leave a fresh home empty", t => {
  const home = scratch(t);
  const workflow = fixture();
  const file = join(home, "rules/rules.sqlite");
  const stored = { workflow_id: workflow.id, item: {} };
  const missing = run(home, "evaluate", stored);
  assert.equal(missing.status, 2);
  assert.equal(object(items(missing.envelope.errors)[0]).code, "E_MIGRATION");
  success(home, "evaluate", { workflow, item: {} });
  for (const bad of [{}, { ...stored, workflow }, { workflow, version: 1, item: {} }, { ...stored, record: "yes" }])
    assert.equal(run(home, "evaluate", bad).status, 1);
  assert.equal(existsSync(join(home, "rules")), false);
  success(home, "workflow put", { workflow });
  const before = readFileSync(file);
  success(home, "evaluate", stored);
  assert.deepEqual(readFileSync(file), before);
  const db = openDb(file, { readonly: false });
  db.exec("PRAGMA user_version=2");
  db.close();
  assert.equal(object(items(run(home, "evaluate", stored).envelope.errors)[0]).code, "E_MIGRATION");
  assert.equal(run(home, "selfcheck").status, 2);
});

test("inline traces reproduce the submitted draft and retain one row across keyed retries", t => {
  const home = scratch(t);
  const workflow = fixture();
  const request = { workflow, item: { b: 1, a: 2 }, record: true, idem_key: "once" };
  const result = success(home, "evaluate", request);
  assert.deepEqual(success(home, "evaluate", { ...request, item: { a: 2, b: 1 } }), result);
  assert.deepEqual(success(home, "workflow list").workflows, []);
  assert.equal(items(success(home, "trace list").traces).length, 1);
  const trace = object(success(home, "trace get", { id: 1 }).trace);
  assert.match(String(trace.version), /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(success(home, "evaluate", { workflow: trace.workflow, item: trace.item }), result);
  assert.deepEqual(trace.steps, result.steps);
});

function concurrent(home: string, command: string, input: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ["dist/ambitious-rules.mjs", ...command.split(" ")], {
      env: { ...process.env, AMBITIOUS_HOME: home }, stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    proc.stdout.on("data", chunk => { output += chunk; });
    proc.stderr.resume();
    proc.on("error", reject);
    proc.on("close", code => code === 0 ? resolve() : reject(new Error(output)));
    proc.stdin.end(JSON.stringify(input));
  });
}

test("concurrent rule edits retain both changes and concurrent retries append one trace", async t => {
  const home = scratch(t);
  const workflow = fixture();
  success(home, "workflow put", { workflow });
  await Promise.all(["left", "right"].map(action => concurrent(home, "rule set", { workflow_id: workflow.id, rule: rule("decide", action, action) })));
  const saved = success(home, "workflow get", { id: workflow.id });
  assert.equal(saved.version, 3);
  assert.deepEqual(items(object(saved.workflow).rules).map(r => object(r).id).sort(), ["decide-left", "decide-right", "decide-yes"]);
  const request = { workflow_id: workflow.id, item: {}, record: true, idem_key: "once" };
  await Promise.all([concurrent(home, "evaluate", request), concurrent(home, "evaluate", request)]);
  assert.equal(items(success(home, "trace list").traces).length, 1);
});
