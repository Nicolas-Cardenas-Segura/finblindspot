# Hardened Agent Docker Sandbox

A secure container sandbox designed to run **Claude Code** and **Google Antigravity CLI (`agy`)** with auto-approval (`--dangerously-skip-permissions`) safely on macOS and Linux hosts.

---

## 🔒 Security Architecture

Running AI coding agents in auto-approval mode on a host machine exposes sensitive host credentials, SSH keys, cloud profiles, and host system integrity to arbitrary tool execution. This setup creates an isolated boundary:

1. **Linux Kernel Hardening**:
   - `cap_drop: [ALL]`: All Linux kernel capabilities are stripped.
   - `security_opt: [no-new-privileges:true]`: Prevents processes from acquiring additional privileges via `setuid`/`setgid`.
   - `pids_limit: 512`: Mitigates fork-bomb denial-of-service risks.

2. **UID/GID Host Alignment**:
   - Dynamically matches the container user (`sandbox`) to host `$(id -u):$(id -g)`.
   - Code files created or modified by the agent inside the container retain native host ownership—eliminating `root`-owned file permission locks on the host.

3. **Confined Credential Access**:
   - Host `~/.gitconfig` is mounted strictly `:ro` (read-only) for commit authorship without exposing git credential helpers or tokens.
   - Host `~/.gemini`, `~/.claude`, and `~/.claude.json` auth caches are mounted directly to preserve existing logins without needing in-container browser OAuth flows.
   - API keys are injected via environment variables (`.env`) rather than baked into images.

4. **Workspace Confinement**:
   - The project repository is mounted to `/workspace:rw`. The agent cannot navigate outside the repository root into parent directories or host home folders.

---

## 🚀 Quickstart

### 1. Configure Secrets
Copy the environment template and provide the required API keys:
```bash
cp docker/.env.docker.example .env
```

### 2. Build the Sandbox Image
```bash
make build
# or: ./scripts/sandbox.sh build
```

### 3. Run Claude Code with Auto-Approval
```bash
make claude
# or: ./scripts/sandbox.sh claude "Review and run calculations tests"
```

### 4. Run Google Antigravity CLI
```bash
make agy
# or: ./scripts/sandbox.sh agy
```

### 5. Interactive Shell
```bash
make shell
# or: ./scripts/sandbox.sh shell
```

### 6. Run OpenSpec Commands
```bash
make openspec ARGS="status"
# or: ./scripts/sandbox.sh openspec status
```
