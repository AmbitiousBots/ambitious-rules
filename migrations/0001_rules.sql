CREATE TABLE versions (
  workflow_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  definition TEXT NOT NULL CHECK (json_valid(definition) AND json_extract(definition, '$.id') IS workflow_id),
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  command TEXT NOT NULL,
  PRIMARY KEY (workflow_id, version)
) STRICT;

CREATE TABLE traces (
  id INTEGER PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  version INTEGER,
  inline_definition TEXT,
  inline_hash TEXT,
  item_hash TEXT NOT NULL,
  item TEXT NOT NULL CHECK (json_valid(item)),
  evaluation TEXT NOT NULL CHECK (json_valid(evaluation)),
  at TEXT NOT NULL,
  FOREIGN KEY (workflow_id, version) REFERENCES versions (workflow_id, version),
  CHECK ((version IS NOT NULL AND inline_definition IS NULL AND inline_hash IS NULL) OR
         (version IS NULL AND inline_hash IS NOT NULL AND inline_definition IS NOT NULL AND
          json_valid(inline_definition) AND json_extract(inline_definition, '$.id') IS workflow_id))
) STRICT;
CREATE INDEX traces_by_workflow ON traces (workflow_id, id);

CREATE TABLE receipts (
  idem_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  response TEXT NOT NULL CHECK (json_valid(response))
) STRICT;

CREATE TRIGGER versions_no_update BEFORE UPDATE ON versions BEGIN
  SELECT RAISE(ABORT, 'Workflow versions are immutable');
END;
CREATE TRIGGER versions_no_delete BEFORE DELETE ON versions BEGIN
  SELECT RAISE(ABORT, 'Workflow versions are immutable');
END;
CREATE TRIGGER traces_no_update BEFORE UPDATE ON traces BEGIN
  SELECT RAISE(ABORT, 'Evaluation traces are append-only');
END;
CREATE TRIGGER traces_no_delete BEFORE DELETE ON traces BEGIN
  SELECT RAISE(ABORT, 'Evaluation traces are append-only');
END;

CREATE TRIGGER versions_no_replace BEFORE INSERT ON versions
WHEN EXISTS (SELECT 1 FROM versions WHERE workflow_id = NEW.workflow_id AND version = NEW.version)
BEGIN
  SELECT RAISE(ABORT, 'Workflow versions are immutable');
END;
CREATE TRIGGER traces_no_replace BEFORE INSERT ON traces
WHEN EXISTS (SELECT 1 FROM traces WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'Evaluation traces are append-only');
END;
