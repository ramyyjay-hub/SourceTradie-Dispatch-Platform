---
name: SourceTradie API generation
description: Compatibility note for OpenAPI code generation in this workspace.
---

Use OpenAPI `number` for numeric identifiers and counts in this project while the generated Zod runtime remains on the current v3-compatible package. OpenAPI `integer` currently produces `zod.int()` in generated validation code, which fails the workspace typecheck.

**Why:** The generator emits a Zod v4-only helper while the installed runtime exposes the v3 API.

**How to apply:** If the runtime is upgraded, re-evaluate this constraint before restoring integer schemas.