# Version and trace model

`Versions.tla` models one workflow, two definition values, three write keys and up to two recorded evaluations. `Put` commits a changed version and its key together. `Record` captures the value of a numbered version. `TraceReplays` requires the saved value to remain available by that version. `OneVersionPerKey` bounds version growth by distinct requests.

Run `npm run tlc`. The `Overwrite` variant must break `TraceReplays`. The `Replay` variant must break `OneVersionPerKey`. The model covers transaction ordering. CLI and migration tests cover SQLite and the JSON representation.
