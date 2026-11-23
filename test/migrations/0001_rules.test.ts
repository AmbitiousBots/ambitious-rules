import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { loadMigrations } from "@ambitious/kit/db/load-migrations";
import { migrate } from "@ambitious/kit/db/migrate";
import { openDb, readUserVersion } from "@ambitious/kit/db/open-db";
import { scratch, success } from "../cli-helper.ts";
import { fixture } from "../fixture.ts";

test("migration 0001 preserves rows, enforces immutable history and binds traces to versions", t => {
  const home = scratch(t);
  const db = openDb(join(home, "rules/rules.sqlite"), { readonly: false });
  t.after(() => db.close());
  assert.equal(readUserVersion(db), 0);
  assert.deepEqual(migrate(db, loadMigrations("migrations")), ["0001_rules"]);
  assert.equal(readUserVersion(db), 1);
  const workflow = fixture();
  success(home, "workflow put", { workflow, idem_key: "first" });
  success(home, "evaluate", { workflow_id: workflow.id, item: {}, record: true });
  assert.deepEqual(migrate(db, loadMigrations("migrations")), []);
  for (const table of ["versions", "traces"]) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    assert.equal(rows.length, 1);
    assert.throws(() => db.exec(`DELETE FROM ${table}`), /immutable|append-only/i);
    assert.throws(() => db.exec(`UPDATE ${table} SET at = 'changed'`), /immutable|append-only/i);
    assert.throws(() => db.exec(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`), /immutable|append-only/i);
    assert.deepEqual(db.prepare(`SELECT * FROM ${table}`).all(), rows);
  }
  assert.throws(() => db.exec(`INSERT INTO traces (workflow_id, version, item_hash, item, evaluation, at)
    VALUES ('missing', 1, 'hash', '{}', '{}', 'time')`), /FOREIGN KEY/);
  assert.equal(db.prepare("PRAGMA journal_mode").get()?.journal_mode, "wal");
  assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
});
