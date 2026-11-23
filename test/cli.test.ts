import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "@ambitious/kit/db/open-db";
import { items, object, run, scratch, success } from "./cli-helper.ts";
import { fixture } from "./fixture.ts";
import { rule } from "../src/examples/seedData.ts";
import { canonicalJson } from "../src/domain/encoding.ts";

function workflowWithParams(params: Record<string, unknown>) {
  const workflow = fixture();
  for (const rule of workflow.rules) rule.then.params = params;
  return workflow;
}

function assertRejected(home: string, command: string, input: unknown, code: string) {
  const result = run(home, command, input);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(object(items(result.envelope.errors)[0]).code, code);
}

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
  const workflow = workflowWithParams({ nested: [{ z: true, a: ["prototype", "constructor", "__proto__"] }] });
  const request = { workflow, item: { b: 1, a: 2 }, record: true, idem_key: "once" };
  const result = success(home, "evaluate", request);
  assert.deepEqual(success(home, "evaluate", { ...request, item: { a: 2, b: 1 } }), result);
  assert.deepEqual(success(home, "workflow list").workflows, []);
  assert.equal(items(success(home, "trace list").traces).length, 1);
  const trace = object(success(home, "trace get", { id: 1 }).trace);
  assert.deepEqual(trace.workflow, JSON.parse(JSON.stringify(workflow)));
  assert.equal(trace.version, `sha256:${createHash("sha256").update(canonicalJson(trace.workflow)).digest("hex")}`);
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

test("recorded evaluations reject private paths and reserved item fields before creating storage", t => {
  const home = scratch(t);
  const workflow = fixture({ field: "__proto__", op: "eq", value: "blue" });
  const alias = join(home, "alias");
  symlinkSync("/home/box/agent-data", alias);
  const requests = [
    [{ filePath: "/home/box/agent-data/example.json" }, "E_FORBIDDEN_PATH"],
    [{ files: [join(alias, "example.json")] }, "E_FORBIDDEN_PATH"],
    [{ [join(alias, "example.json")]: "file" }, "E_FORBIDDEN_PATH"],
    [{ ["__proto__"]: "blue" }, "E_INPUT_SCHEMA"],
  ] as const;
  for (const [item, code] of requests) {
    const result = run(home, "evaluate", { workflow, item, record: true, idem_key: "first" });
    assert.equal(result.status, 1);
    assert.equal(object(items(result.envelope.errors)[0]).code, code);
    assert.equal(existsSync(join(home, "rules")), false);
  }
  success(home, "evaluate", { workflow, item: {}, record: true, idem_key: "first" });
});

test("writes reject reserved JSON member names in rules and items before opening storage", t => {
  const home = scratch(t);
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const member = { [key]: "value" };
    const direct = workflowWithParams(member);
    const nested = workflowWithParams({ entries: [member] });
    for (const workflow of [direct, nested]) {
      assertRejected(home, "workflow put", { workflow, idem_key: "put" }, "E_INPUT_SCHEMA");
      assertRejected(home, "rule set", { workflow_id: workflow.id, rule: workflow.rules[0] }, "E_INPUT_SCHEMA");
      assertRejected(home, "evaluate", { workflow, item: {}, record: true }, "E_INPUT_SCHEMA");
    }
    assertRejected(home, "evaluate", { workflow: fixture(), item: member, record: true }, "E_INPUT_SCHEMA");
  }
  assert.equal(existsSync(join(home, "rules")), false);
});

test("private parameter names and trimmed receipt keys fail before database and receipt creation", t => {
  const home = scratch(t);
  const filename = "/home/box/agent-data/example.json";
  const workflow = workflowWithParams({ entries: [{ [filename]: true }] });
  const requests = [
    { workflow, idem_key: "unused" },
    { workflow: fixture(), idem_key: ` \t${filename}\n` },
  ];
  for (const request of requests) assertRejected(home, "workflow put", request, "E_FORBIDDEN_PATH");
  assert.equal(existsSync(join(home, "rules")), false);
  success(home, "selfcheck");
  for (const request of requests) assertRejected(home, "workflow put", request, "E_FORBIDDEN_PATH");
  const db = openDb(join(home, "rules/rules.sqlite"), { readonly: true });
  t.after(() => db.close());
  assert.equal(db.prepare("SELECT count(*) AS n FROM receipts").get()?.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM versions").get()?.n, 0);
});

test("workflow and evaluation input reject lone surrogates in names, member names and values", t => {
  const home = scratch(t);
  const workflow = fixture();
  for (const bad of ["\ud800", "\udfff"]) {
    for (const definition of [
      { ...workflow, name: bad },
      workflowWithParams({ entries: [{ [bad]: 1 }] }),
      workflowWithParams({ entries: [bad] }),
      { ...workflow, nodes: workflow.nodes.map(node => ({ ...node, label: bad })) },
    ]) assertRejected(home, "workflow put", { workflow: definition }, "E_INPUT_SCHEMA");
    for (const item of [{ [bad]: "value" }, { list: [bad] }]) {
      assertRejected(home, "evaluate", { workflow, item, record: true }, "E_INPUT_SCHEMA");
    }
  }
  assert.equal(existsSync(join(home, "rules")), false);
  const name = "Route \u{1f680}";
  success(home, "workflow put", { workflow: { ...workflow, name } });
  assert.equal(object(success(home, "workflow get", { id: workflow.id }).workflow).name, name);
  assert.equal(object(items(success(home, "workflow list").workflows)[0]).name, name);
});

test("reads preserve member names and Unicode escapes in previously stored definitions", t => {
  const home = scratch(t);
  success(home, "selfcheck");
  const db = openDb(join(home, "rules/rules.sqlite"), { readonly: false });
  t.after(() => db.close());
  const workflow = workflowWithParams({ entries: [{ ["__proto__"]: 1 }] });
  workflow.name = "Route \ud800";
  const definition = canonicalJson(workflow);
  const digest = createHash("sha256").update(definition).digest("hex");
  db.prepare("INSERT INTO versions VALUES (?, 1, ?, 'caller', '2026-01-01', 'workflow put')").run(workflow.id, definition);
  db.prepare(`INSERT INTO traces (workflow_id, inline_definition, inline_hash, item_hash, item, evaluation, at)
    VALUES (?, ?, ?, ?, '{}', '{}', '2026-01-01')`).run(workflow.id, definition, digest, createHash("sha256").update("{}").digest("hex"));
  assert.deepEqual(success(home, "workflow get", { id: workflow.id }).workflow, JSON.parse(definition));
  assert.equal(object(items(success(home, "workflow list").workflows)[0]).name, workflow.name);
  const trace = object(success(home, "trace get", { id: 1 }).trace);
  assert.deepEqual(trace.workflow, JSON.parse(definition));
  assert.equal(trace.version, `sha256:${createHash("sha256").update(canonicalJson(trace.workflow)).digest("hex")}`);
});

test("malformed Unicode identifiers fail on creation and lookup", t => {
  const home = scratch(t);
  const id = "\ud800";
  const workflow = fixture();
  for (const [command, input] of [
    ["workflow put", { workflow: { ...workflow, id } }],
    ["workflow get", { id }], ["workflow history", { id }],
    ["rule enable", { workflow_id: workflow.id, rule_id: id }],
    ["trace list", { workflow_id: id }],
    ["evaluate", { workflow_id: id, item: {} }],
  ] as const) {
    const result = run(home, command, input);
    assert.equal(result.status, 1);
    assert.equal(object(items(result.envelope.errors)[0]).code, "E_INPUT_SCHEMA");
  }
  assert.equal(existsSync(join(home, "rules")), false);
  const valid = { ...workflow, id: "route-\u{1F680}" };
  success(home, "workflow put", { workflow: valid });
  assert.equal(object(success(home, "workflow get", { id: valid.id }).workflow).id, valid.id);
});

test("file input checks links before reading and accepts a public input file", t => {
  const home = scratch(t);
  const source = join(home, "input.json");
  const alias = join(home, "alias");
  const loop = join(home, "loop");
  writeFileSync(source, JSON.stringify({ workflow: fixture(), item: {} }));
  symlinkSync(source, alias);
  symlinkSync(loop, loop);
  for (const [args, status] of [[["--in", alias], 0], [[`--in=${loop}`], 1]] as const) {
    const result = spawnSync(process.execPath, ["dist/ambitious-rules.mjs", "evaluate", ...args], {
      encoding: "utf8", input: "", env: { ...process.env, AMBITIOUS_HOME: home },
    });
    assert.equal(result.status, status, result.stdout);
    if (status === 1) assert.equal(object(items(object(JSON.parse(result.stdout)).errors)[0]).code, "E_FORBIDDEN_PATH");
  }
});
