# Harness adapters

These mappings follow official documentation checked on 2026-09-19. Inspect
capabilities in the installed version; provider access and CLI flags vary.
Native model execution was not exercised by this repository's offline tests.

## Claude Code

Install with `--harness claude` (or `all`). This creates:

- `.claude/skills/openspec-fastflow/` for skill discovery;
- `.claude/agents/fastflow-worker.md` with `model: haiku`;
- `.claude/agents/fastflow-reviewer.md` with `model: sonnet`;
- the shared skill and OpenSpec schema.

Start a new session after installation if the current session has not discovered
the files. Ask the main agent:

> Use openspec-fastflow on change `<name>`. Stay the coordinator. Dispatch the
> ready independent tasks to fastflow-worker subagents, at most two at once.
> Use each packet's required tier, verify the workspace base, integrate the
> results, and run the acceptance checks yourself.

The main agent uses its actual Agent/subagent tool, requesting background
execution when supported. The cheap worker definition is only for cheap-tier
packets. For balanced/strong packets, use an explicit model override supported
by the tool or a separate worker definition with `sonnet`/`opus`. Do not hand a
strong packet to a Haiku definition and assume the packet changes its model.
If those choices are unavailable, stop or have the main agent do the work at an
adequate model tier. The reviewer default is balanced; high-risk review needs
strong. Shell access is not a read-only security boundary.

The templates use `isolation: worktree` and a 12-turn limit. **Verify the base**:
Claude's documentation says automatic worktrees may start at the default branch,
not the parent HEAD. Use the installed version's documented base-selection
mechanism, or the explicit worktree fallback in the protocol. Do not integrate a
result based on the wrong revision. A turn-limit result is partial, not success.

Sources: [subagents](https://code.claude.com/docs/en/sub-agents),
[skills](https://code.claude.com/docs/en/skills),
[worktrees](https://code.claude.com/docs/en/worktrees).

## Google Antigravity

Install with `--harness antigravity` (or `all`). The current documented workspace
paths are `.agents/skills/` and `.agents/agents/`. Older versions used
`.agent/skills/`; OpenSpec 1.13.0 also generates its own skills under `.agent/`.
Check your version's discovery paths. On an older version, copy the entire
FastFlow skill into `.agent/skills/openspec-fastflow/` after checking for existing
files; keep one maintained copy to avoid divergent instructions.

The provided worker uses `model: flash`; the reviewer uses `model: pro`.
Both are subagents, not main-agent replacements, and use the documented sandbox
execution policy. Map cheap → flash; balanced/strong → pro when it is adequate
for the work. These are tier names, not promises of identical capabilities or
prices across providers.

Ask your main agent to load the skill, then use its documented
`invoke_subagent` tool with a dedicated packet and an isolated `branch`
workspace. Antigravity documents `inherit`, `branch`, and `share` workspace
options, and asynchronous results. Inspect the live tool schema instead of
inventing JSON keys. Use `define_subagent` or a model override if supported to
create a pro implementation worker; the provided reviewer has no editing tools.

The CLI `/agents` panel monitors custom agents and background subagents.
If your edition lacks these tools, use separate sessions/worktrees or serial
execution. Never treat a workflow Markdown file as an automatic multi-agent
runtime. Verify final status and actual workspace revision before integration.

Sources: [skills](https://antigravity.google/docs/skills/),
[subagents](https://antigravity.google/docs/subagents/),
[/agents](https://antigravity.google/docs/cli/commands/agents/).

## Any other coding harness

Install with `--harness generic`. Load `.agents/skills/openspec-fastflow/SKILL.md`
directly if your harness does not discover the Agent Skills layout.
You can add a link to that skill in the harness's existing project instructions;
the installer deliberately does not replace AGENTS.md, CLAUDE.md, or settings.

Map capabilities, not brand names:

| Requirement           | Preferred capability       | Fallback                      |
| --------------------- | -------------------------- | ----------------------------- |
| Independent execution | Native subagent            | Separate coding session       |
| Model routing         | Explicit per-worker model  | User-configured session model |
| Workspace isolation   | Explicit-base worktree     | Parent-created Git worktree   |
| Results               | Native result/notification | Structured report and patch   |
| No child execution    | —                          | Parent executes serially      |

The same OpenSpec artifacts, task IDs, packets, and parent verification apply.
