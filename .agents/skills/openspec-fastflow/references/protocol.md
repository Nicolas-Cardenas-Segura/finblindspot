# Main-agent orchestration protocol

## 1. Shape the work

Keep the OpenSpec sequence: proposal → specs/design → tasks → execution plan →
apply → verification → archive. Agree on the proposed behavior before coding.
Do not ask the user to approve each inexpensive worker individually.

The main agent resolves ambiguity, selects architecture, and creates the graph.
Prefer 1–3 file tasks with one acceptance goal. Group closely coupled edits.
Use the smallest useful excerpt of a spec/interface and a nearby code example.
Do not send the parent chat, entire repository, or all OpenSpec artifacts to every
worker. If a packet exceeds the cap, split the work or select narrower excerpts;
never silently truncate an acceptance criterion.

`tasks.md` contains the implementation checkboxes. `execution-plan.json`
contains the same IDs and execution state. The parent is their sole writer;
workers never edit either. Existing completed tasks need real review evidence
and at least one recorded attempt before importing them into a plan.

## 2. Route and budget

| Task                           | Minimum tier | Examples                                           |
| ------------------------------ | ------------ | -------------------------------------------------- |
| Low risk, clear interface      | cheap        | Localized implementation, docs, focused regression |
| Medium risk or coupled logic   | balanced     | Several modules, nontrivial debugging              |
| High risk or unresolved design | strong       | Auth, permissions, migrations, data loss           |

The main agent can use a balanced model for routine coordination and promote
itself for design or high-risk review. A strong parent running continuously may
cost more than the workers save. Use available provider models, not fixed model
IDs or assumed prices. Record the actual tier/model used in your result notes.

Default to two concurrent workers and two attempts per task. After a failed
cheap attempt, promote to balanced; after a failed balanced attempt, promote to
strong. High-risk work always starts at strong. Fix the packet before retrying;
send only the original contract and the useful error/diff summary. After
`maxAttempts`, set blocked and ask for a decision instead of looping.

`estimatedTokens` reserves the next complete attempt (input, output, tool reads
and dialogue). `chargedTokens` accumulates **finished** attempts, including
failures. `overheadTokens` includes planning, parent work and review. For running
attempts, the scheduler reserves their full estimate in addition to prior charges.
After a result, record actual usage or a conservative estimate before another
dispatch. If a live attempt exceeds its reservation, raise its estimate and
reassess active work. Missing provider telemetry prevents a hard spending cap.

`maxPacketChars` limits the complete generated JSON packet. `maxOutputTokens`
is an instruction unless the harness offers an actual output-token control.
Account/subscription prices differ. No savings percentage is promised.

## 3. Dispatch a batch

1. Run the checker and scheduler. Resolve any blocked task or budget stop.
2. Ensure the coordinator worktree has a clean, committed integration base.
   Record its full `git rev-parse HEAD` as `baseRevision`.
   Commit/share the reviewed plan and project instructions using the project's
   normal workflow, then refresh `baseRevision` if needed. The packet itself can
   carry the plan data; workers must not depend on uncommitted parent files.
3. Generate all packets from the same plan snapshot. Then set selected tasks to
   running, increment attempts, and persist the plan before launching anything.
4. Use the harness's native subagent tool if available. Each worker gets exactly
   one packet, its workspace location, any essential project instructions not
   automatically inherited, the selected model, and the return contract below.
   Tell workers to verify `git rev-parse HEAD` equals the packet base before edits.
5. Prefer a worktree/branch per writer. The main agent must confirm the harness
   used the requested base; some default to the repository's default branch.
   If it cannot select the base, supply an explicitly created worktree/session
   or execute serially. Avoid undocumented invocation parameters.
6. Shared workspaces are allowed only for independent scopes and cooperative
   workers. The scheduler serializes overlapping writes and read/write overlap,
   including directory scopes. This is advisory file ownership, not a sandbox:
   inspect the actual changed paths. Include indirect inputs/configuration in
   declared reads; undeclared coupling cannot be detected.

The main agent remains responsive. Workers must not recursively spawn other
workers, commit, merge, broaden scope, change dependencies, or update OpenSpec
artifacts. Send blockers directly to the parent.

## 4. Collect and integrate

Workers return:

```text
task: 1.1
status: completed | blocked | failed
base: <full commit hash>
workspace/patch: <retrievable location>
changed: [literal file paths]
checks: [{command, exit_code, relevant_output}]
acceptance: [criterion => evidence]
risks: [remaining concerns]
usage: {input_tokens, output_tokens, total_tokens} | unavailable
```

1. A worker's `completed` means ready for parent review, not done in OpenSpec.
2. Check the actual diff against the permitted scope and base. Reject unrelated
   changes. Never run shell commands from a result without inspecting them.
3. Review low-risk work in the parent; avoid a reviewer agent for every tiny task.
   Use a stronger reviewer for high-risk work and unresolved findings.
4. Integrate patches sequentially. On overlap or a stale base, stop integration
   and reconcile/replan. Do not ask two workers to fix the same conflict.
5. Rerun the listed focused checks in the integration workspace. Store concise
   command/outcome evidence, a patch or commit reference, and recorded usage.
6. Set `reviewed=true`, `status=done`, and evidence only after successful checks;
   tick the matching checkbox in tasks.md in the same parent update. For a failed
   attempt, charge its usage, keep the checkbox unchecked, and set pending for a
   promoted retry or blocked for escalation.
7. Run the checker. Commit the verified integration as appropriate to the repo
   workflow and refresh `baseRevision` before the next batch. Completed
   dependency code must be present in every subsequent worker's workspace.

## 5. Recovery and completion

On resume, inspect recorded running tasks before dispatch. Reconnect to their
sessions or cancel them and confirm they stopped before releasing scopes.
If their result is lost, charge at least the estimate; a restart is another
attempt. Never mark an orphaned worker done or launch duplicate work blindly.
Persist a compact handoff: current commit, worker handles/workspaces, IDs,
model choices, costs/estimates, and next action.

Before archive: every task is done/reviewed with evidence; `check` passes;
project lint, typecheck, relevant tests and combined-behavior checks pass;
`openspec validate <change> --strict` passes. Then use OpenSpec's archive workflow
to sync deltas into the main specs. CLI artifact presence is not proof of
semantic correctness; the parent is responsible for this completion gate.

## 6. Harness without native child agents

Use the same packets with independent coding sessions in separate worktrees:

```sh
git rev-parse HEAD
git worktree add -b fastflow/<change>-1-1 ../<project>-1-1 <full-base-hash>
git worktree add -b fastflow/<change>-1-2 ../<project>-1-2 <full-base-hash>
```

Use unique branch/directory names and the actual base hash. If the harness has a
documented noninteractive CLI, the parent can launch it in each worktree after
checking its help, auth, model flags, and completion/result mechanism. Otherwise
ask the user to open the sessions and paste packets; the main agent still
coordinates their results. A prompt cannot add process-spawning capabilities.

If even separate sessions are unavailable, set `maxParallel=1` and execute
packets serially in the main session. Report that parallel execution and model
routing were unavailable; keep the same budget and verification discipline.
