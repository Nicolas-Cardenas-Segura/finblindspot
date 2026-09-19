#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOCKER_DIR="${ROOT_DIR}/docker"

# Detect Host UID and GID to ensure files created in container maintain host ownership
export HOST_UID="$(id -u)"
export HOST_GID="$(id -g)"

# Ensure optional host config files/directories exist to prevent Docker creating root directories
[ -f "${HOME}/.gitconfig" ] || touch "${HOME}/.gitconfig"
[ -d "${HOME}/.gemini" ] || mkdir -p "${HOME}/.gemini"
[ -d "${HOME}/.claude" ] || mkdir -p "${HOME}/.claude"
[ -f "${HOME}/.claude.json" ] || touch "${HOME}/.claude.json"

COMPOSE_FILE="${DOCKER_DIR}/docker-compose.yml"

usage() {
    cat <<EOF
Usage: $(basename "$0") <command> [arguments...]

Hardened Docker sandbox for executing Claude Code, Antigravity, and OpenSpec safely with auto-approval.

Commands:
  build               Build or rebuild the sandbox container image
  claude [args...]    Run Claude Code with --dangerously-skip-permissions inside the sandbox
  agy [args...]       Run Google Antigravity CLI inside the sandbox
  openspec [args...]  Run OpenSpec CLI inside the sandbox
  shell               Launch an interactive bash session in the sandbox
  run <cmd...>        Run an arbitrary command inside the sandbox
  help                Display this help message

Examples:
  ./scripts/sandbox.sh build
  ./scripts/sandbox.sh claude "Implement pure math unit tests in test/calculations.test.ts"
  ./scripts/sandbox.sh agy
  ./scripts/sandbox.sh openspec status
  ./scripts/sandbox.sh shell
EOF
}

cmd_build() {
    echo "==> Building sandbox image (UID: ${HOST_UID}, GID: ${HOST_GID})..."
    docker compose -f "${COMPOSE_FILE}" build
}

cmd_run() {
    docker compose -f "${COMPOSE_FILE}" run --rm agent-sandbox "$@"
}

cmd_claude() {
    echo "==> Starting Claude Code in auto-approval sandbox mode..."
    if [ "$#" -eq 0 ]; then
        docker compose -f "${COMPOSE_FILE}" run --rm agent-sandbox claude --dangerously-skip-permissions
    else
        docker compose -f "${COMPOSE_FILE}" run --rm agent-sandbox claude --dangerously-skip-permissions "$@"
    fi
}

cmd_agy() {
    echo "==> Starting Antigravity CLI in sandbox..."
    docker compose -f "${COMPOSE_FILE}" run --rm agent-sandbox agy "$@"
}

cmd_openspec() {
    docker compose -f "${COMPOSE_FILE}" run --rm agent-sandbox openspec "$@"
}

cmd_shell() {
    echo "==> Opening interactive shell in sandbox (working directory: /workspace)..."
    docker compose -f "${COMPOSE_FILE}" run --rm agent-sandbox bash
}

COMMAND="${1:-help}"
shift || true

case "${COMMAND}" in
    build)
        cmd_build "$@"
        ;;
    claude)
        cmd_claude "$@"
        ;;
    agy)
        cmd_agy "$@"
        ;;
    openspec|opsx)
        cmd_openspec "$@"
        ;;
    shell|bash)
        cmd_shell "$@"
        ;;
    run)
        cmd_run "$@"
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        echo "Unknown command: ${COMMAND}"
        usage
        exit 1
        ;;
esac
