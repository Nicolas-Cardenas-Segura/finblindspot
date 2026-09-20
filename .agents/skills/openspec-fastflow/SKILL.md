---
name: openspec-fastflow
description: Execute OpenSpec tasks economically using bounded context, cheaper models, and multiple agents coordinated by the user's main agent. Use for fast or low-cost implementation, task delegation, or parallel OpenSpec apply across Claude Code, Antigravity, and other coding harnesses.
---

# OpenSpec FastFlow

You are the user's main agent and the only coordinator. Keep requirements,
architecture, integration, and final verification in your control. Delegate
small implementation tasks to the least expensive capable available model.
Do small trivial changes yourself when delegation would cost more.

## Before execution

1. Read the project's agent policy and the selected OpenSpec change. Run
   `openspec status --change <change> --json` and
   `openspec instructions apply --change <change> --json`.
   Respect actual artifact paths and readiness from the CLI.
2. Use the `fastflow` schema for new changes. For an existing `spec-driven`
   change, keep its schema and add an execution plan beside tasks.md.
   Resolve missing interfaces or acceptance criteria before dispatch.
3. Read [the orchestration protocol](references/protocol.md). Read only your
   harness section in [harness adapters](references/harnesses.md).
4. Discover actual child-session, model-selection, isolation and result-return
   capabilities. Never pretend that writing this skill starts agents.
   Record the selected model for each tier; unavailable tiers require an
   explicit substitution or a stop, never silent expensive inheritance.

## Execute

Use this skill directory as `<skill>`. The installer provides the shared copy
at `.agents/skills/openspec-fastflow`; Claude also gets `.claude/skills/...`.
All scripts require Node >=20.19 and no npm dependencies.

```sh
node <skill>/scripts/flow.mjs check openspec/changes/<change>/execution-plan.json
node <skill>/scripts/flow.mjs ready openspec/changes/<change>/execution-plan.json
node <skill>/scripts/flow.mjs packet openspec/changes/<change>/execution-plan.json 1.1 --root .
```

- Generate packets for the entire ready batch **before** editing its state.
- Mark selected tasks running and increment attempts **before** starting workers.
- Launch at most `maxParallel` independent workers. Assign one packet to each,
  with a verified base commit, isolated workspace, and the selected model.
- Workers return patches and compact evidence; only you review, integrate,
  record token usage, and mark tasks done in both files.
- Run focused checks first, then project lint/typecheck/tests after integration.
- Rerun `check` and `ready` after each batch. Archive only when every task is
  verified and the actual OpenSpec change validates.

The protocol defines retries, workspace handoff, crash recovery, and the serial
fallback. Packet character limits are not token limits. These scripts validate
plans and choose batches; they neither call a model nor enforce provider spend.
