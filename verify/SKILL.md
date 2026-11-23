---
name: verify-rules
description: Verify each Rules command using the built executable and a fresh database.
---

# Verify Rules

Run `npm run build` and `node verify/run` from the repository root. Use `node verify/run --list` to see the checks or `--only trace-get` to inspect a single feature. Each feature starts with an empty home. The runner prints the evidence directory and returns a nonzero status on failure.

Run `npm run release:check` for the complete release gate.
