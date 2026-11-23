import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { items, object, run, runRaw, success } from "../test/cli-helper.ts";
import { check, fixture } from "../test/fixture.ts";
import { evaluate } from "../src/domain/evaluate.ts";
import { rule } from "../src/examples/seedData.ts";
import { canonicalJson } from "../src/domain/encoding.ts";

const workflow = fixture(check("ready", "eq", true));
const id = workflow.id;
const edit = { workflow_id: id, rule_id: "decide-yes", actor: "editor" };
const item = { ready: true };
const put = (home: string) => success(home, "workflow put", { workflow });
const record = (home: string) => success(home, "evaluate", { workflow_id: id, item, record: true });
const names = ["commands", "selfcheck", "workflow put", "workflow get", "workflow list", "workflow history",
  "rule set", "rule enable", "rule disable", "evaluate", "trace list", "trace get", "seed"];

function checkOverflow(home: string, command: string, extra: Record<string, unknown>) {
  const definition = fixture();
  for (const entry of definition.rules) entry.then.params = { limits: [{ maximum: null }] };
  const request = JSON.stringify({ workflow: definition, idem_key: "overflow", ...extra });
  for (const literal of ["1e400", "-1e400"]) {
    const raw = request.replace('"maximum":null', `"maximum":${literal}`);
    const rejected = runRaw(home, command, raw);
    assert.equal(rejected.status, 1, rejected.stdout);
    assert.equal(object(items(rejected.envelope.errors)[0]).code, "E_INPUT_SCHEMA");
    assert.equal(existsSync(join(home, "rules")), false);
  }
}

export const features: Record<string, (home: string) => void> = {
  commands(home) {
    const entries = items(success(home, "commands").commands).map(object);
    assert.deepEqual(entries.map(entry => entry.name), [...names].sort());
    const readme = readFileSync("README.md", "utf8").split("## Commands\n")[1]?.split("\n## ")[0] ?? "";
    const documented = [...readme.matchAll(/^\| `([^`]+)` \| ([^|]+) \|/gm)];
    assert.deepEqual(Object.fromEntries(documented.map(([, name, access]) => [name, access])),
      Object.fromEntries(entries.map(entry => [entry.name, entry.access])));
  },
  selfcheck(home) {
    const first = success(home, "selfcheck");
    assert.equal(object(first.db).userVersion, 1);
    assert.equal(object(first.db).integrityCheck, "ok");
    assert.deepEqual(object(success(home, "selfcheck").db).migrationsApplied, []);
  },
  "workflow-put"(home) {
    checkOverflow(home, "workflow put", {});
    const named = { ...workflow, name: "\uFFFD" };
    const request = { workflow: named, idem_key: "utf8" };
    const [prefix, suffix] = JSON.stringify(request).split(named.name);
    assert.ok(prefix && suffix);
    const bytes = Buffer.concat([Buffer.from(prefix), Buffer.from([0xff]), Buffer.from(suffix)]);
    const file = join(home, "input.json");
    writeFileSync(file, bytes);
    for (const result of [runRaw(home, "workflow put", bytes), runRaw(home, "workflow put", "", ["--in", file])]) {
      assert.equal(result.status, 1, result.stdout);
      assert.equal(object(items(result.envelope.errors)[0]).code, "E_INPUT_SCHEMA");
      assert.equal(existsSync(join(home, "rules")), false);
    }
    const invalid = { ...workflow, name: "\ud800" };
    const rejected = run(home, "workflow put", { workflow: invalid });
    assert.equal(rejected.status, 1);
    assert.equal(object(items(rejected.envelope.errors)[0]).code, "E_INPUT_SCHEMA");
    assert.deepEqual(success(home, "workflow put", request), { workflow_id: id, version: 1, changed: true });
    assert.equal(object(success(home, "workflow get", { id }).workflow).name, named.name);
    assert.deepEqual(success(home, "workflow put", { workflow: named }), { workflow_id: id, version: 1, changed: false });
    assert.equal(success(home, "workflow put", { workflow: { ...workflow, name: "Changed" } }).version, 2);
  },
  "workflow-get"(home) {
    put(home);
    success(home, "rule disable", edit);
    assert.deepEqual(success(home, "workflow get", { id, version: 1 }).workflow, JSON.parse(JSON.stringify(workflow)));
    assert.equal(success(home, "workflow get", { id }).version, 2);
  },
  "workflow-list"(home) {
    put(home);
    success(home, "rule disable", edit);
    const rows = items(success(home, "workflow list").workflows);
    assert.equal(rows.length, 1);
    assert.equal(object(rows[0]).version, 2);
  },
  "workflow-history"(home) {
    put(home);
    success(home, "rule disable", edit, "2026-01-02T12:00:00Z");
    const rows = items(success(home, "workflow history", { id }).versions).map(object);
    assert.deepEqual(rows.map(r => r.version), [1, 2]);
    assert.deepEqual(rows[1], { workflow_id: id, version: 2, at: "2026-01-02T12:00:00.000Z", actor: "editor", command: "rule disable" });
  },
  "rule-set"(home) {
    const second = rule("decide", "else", "Otherwise");
    const large = { ...workflow, name: "é".repeat(256 * 1024) };
    success(home, "workflow put", { workflow: large });
    const remaining = 1024 * 1024 - Buffer.byteLength(canonicalJson({ workflow: { ...large, rules: [...large.rules, second] } }));
    const atLimit = { ...second, name: second.name + "x".repeat(remaining) };
    const edit = { workflow_id: id, idem_key: "append" };
    const oversized = run(home, "rule set", { ...edit, rule: { ...atLimit, name: atLimit.name + "x" } });
    assert.equal(oversized.status, 1, oversized.stdout);
    assert.equal(object(items(oversized.envelope.errors)[0]).code, "E_INPUT_SCHEMA");
    const before = success(home, "workflow get", { id });
    assert.equal(before.version, 1);
    assert.deepEqual(before.workflow, JSON.parse(JSON.stringify(large)));
    assert.equal(success(home, "rule set", { ...edit, rule: atLimit }).version, 2);
    assert.equal(success(home, "workflow put", { workflow: { ...large, rules: [atLimit, ...large.rules] } }).version, 3);
    success(home, "rule set", { workflow_id: id, rule: { ...second, name: "Updated" } });
    const current = object(success(home, "workflow get", { id }).workflow);
    assert.deepEqual(items(current.rules).map(r => object(r).name), ["Updated", "Accept matching items"]);
  },
  "rule-enable"(home) {
    put(home);
    success(home, "rule disable", edit);
    assert.equal(success(home, "rule enable", edit).version, 3);
    assert.equal(object(success(home, "evaluate", { workflow_id: id, item }).outcome).action, "accept");
  },
  "rule-disable"(home) {
    put(home);
    assert.equal(success(home, "rule disable", edit).version, 2);
    assert.equal(object(success(home, "evaluate", { workflow_id: id, item }).outcome).action, "review");
    assert.equal(success(home, "rule disable", edit).changed, false);
  },
  evaluate(home) {
    checkOverflow(home, "evaluate", { item, record: true });
    const rejected = run(home, "evaluate", { workflow, item: { filePath: "/home/box/agent-data/example.json" }, record: true });
    assert.equal(rejected.status, 1);
    assert.equal(object(items(rejected.envelope.errors)[0]).code, "E_FORBIDDEN_PATH");
    const expected = evaluate(workflow, item);
    assert.deepEqual(success(home, "evaluate", { workflow, item }), expected);
    put(home);
    success(home, "rule disable", edit);
    const request = { workflow_id: id, item, version: 1 };
    assert.deepEqual(success(home, "evaluate", request), expected);
    assert.equal(run(home, "evaluate", request).stdout, run(home, "evaluate", request).stdout);
    assert.deepEqual(success(home, "trace list").traces, []);
  },
  "trace-list"(home) {
    put(home);
    record(home);
    record(home);
    success(home, "evaluate", { workflow: { ...workflow, id: "draft" }, item, record: true });
    const rows = items(success(home, "trace list", { workflow_id: id, limit: 1 }).traces).map(object);
    assert.deepEqual(rows.map(row => row.id), [2]);
    assert.equal(items(success(home, "trace list").traces).length, 3);
  },
  "trace-get"(home) {
    put(home);
    const result = record(home);
    success(home, "rule disable", edit);
    const trace = object(success(home, "trace get", { id: 1 }).trace);
    assert.deepEqual(trace, { id: 1, workflow_id: id, version: 1, at: "2026-01-01T00:00:00.000Z",
      item_hash: createHash("sha256").update(canonicalJson(item)).digest("hex"), item, ...result });
  },
  seed(home) {
    const file = join(home, "seed.json");
    writeFileSync(file, "{}");
    for (const [input, path] of [["\n", file], [Buffer.from([0xff]), file], [" ", join(home, "missing")]] as const) {
      const conflict = runRaw(home, "seed", input, ["--in", path]);
      assert.equal(conflict.status, 1, conflict.stdout);
      assert.equal(object(items(conflict.envelope.errors)[0]).code, "E_USAGE");
      assert.equal(existsSync(join(home, "rules")), false);
    }
    assert.equal(items(success(home, "seed").created).length, 6);
    const first = object(items(success(home, "workflow list").workflows)[0]).workflow_id;
    const saved = object(success(home, "workflow get", { id: first }).workflow);
    success(home, "workflow put", { workflow: { ...saved, name: "Edited" } });
    assert.deepEqual(success(home, "seed"), { created: [], skipped: 6 });
    assert.equal(object(success(home, "workflow get", { id: first }).workflow).name, "Edited");
  },
};

if (import.meta.main) {
  const feature = features[process.argv[2] ?? ""];
  const home = process.env.AMBITIOUS_HOME;
  assert(feature && home);
  assert.deepEqual(Object.keys(features).sort(), JSON.parse(readFileSync("verify/features.json", "utf8")).map((f: { id: string }) => f.id).sort());
  feature(home);
}
