# Agent Directives: Hardened Container Sandbox

You are operating inside an isolated, containerized execution environment specifically hardened for software development, specification planning, testing, and automated execution.

---

## 1. Execution Environment & Boundaries

* **Workspace Scope:** Your workspace is strictly mounted to `/workspace` (which maps to the repository root on the host). Never attempt to access or traverse paths outside `/workspace`.
* **Unprivileged User:** You run as an unprivileged user (`sandbox`) whose UID and GID match the host user. You do not have `root` or `sudo` privileges. Linux capabilities are dropped (`cap_drop: [ALL]`) and privilege escalation is blocked (`no-new-privileges:true`).
* **Git Identity & Authorship:** Host Git author identity (`user.name`, `user.email`) is mounted read-only from `~/.gitconfig`. Workspace files and Git commits are owned by the host user.
* **Network Constraints:**
  * Outbound internet access is enabled for calling AI APIs (Nebius, Anthropic, Gemini), installing dependencies (`npm`, `pip`), and interacting with remote Git repositories.
  * You are strictly prohibited from scanning or probing private RFC 1918 internal networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) or localhost services outside the container.

---

## 2. Secrets & Credential Protocols

* **Environment Secrets:** Third-party API keys (`NEBIUS_API_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `GALTEA_API_KEY`, etc.) are injected via environment variables from `.env`.
* **Credential Hygiene:** Never print, log, echo, commit, or hardcode API keys or authentication tokens. Ensure `.env` files remain strictly untracked in Git.
* **OAuth Caches:** Pre-authenticated sessions for Claude (`~/.claude`, `~/.claude.json`) and Antigravity (`~/.gemini`) are mounted directly from the host.

---

## 3. Spec-Driven & Autonomous Execution

* This workspace uses **OpenSpec** for change management (`openspec/specs/` and `openspec/changes/`).
* Always verify system state and tests (`npm test`, `git status`, `git diff`) before and after implementing changes.
* Do not perform destructive Git commands (`git reset --hard`, `git push --force`) without explicit user instruction.
