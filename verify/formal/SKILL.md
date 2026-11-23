---
name: verify-rules-formal
description: Check version ordering, trace replay and ordered branch selection.
---

# Verify the model and proof

Run `npm run tlc`. Each `Put` models the transaction containing `saveVersion` and `withReceipt`. `Record` models `appendTrace` for a saved version. Read [the model bounds](../../spec/README.md) when changing these operations.

Run `npm run lean`. `FirstMatch.lean` proves that the first accepted element after a rejected prefix is selected for any remaining list.
