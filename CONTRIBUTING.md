# Contributing

Use the pinned tools in `.mise.toml` and the Lean version in `proofs/lean-toolchain`. Install the development dependencies with `npm ci`. The kit tarballs and release checksums are in `vendor/`.

Run `npm run build` and `node verify/run` to exercise the CLI in temporary directories. Run `npm run release:check` for type checking, lint, the dependency graph, tests, the kit contract, TLA+ models, the Lean proof, feature checks and release packaging. The release assets are written to `release/`.

Include the behavior change, decisions and verification output in the pull request. Follow the [code of conduct](CODE_OF_CONDUCT.md) and use the [private reporting instructions](SECURITY.md) for vulnerabilities.
