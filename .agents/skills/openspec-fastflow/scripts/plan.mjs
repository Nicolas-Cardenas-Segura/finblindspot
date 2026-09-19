import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/** @typedef {import('./types.js').Plan} Plan */
/** @typedef {import('./types.js').Task} Task */
/** @typedef {import('./types.js').Tier} Tier */

/** @param {unknown} value @param {string} label */
function object(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @param {string} label */
function text(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

/** @param {unknown} value @param {string} label @param {number} min */
function integer(value, label, min) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min
  ) {
    throw new Error(`${label} must be an integer >= ${min}`);
  }
  return value;
}

/** @template T @param {unknown} value @param {string} label @param {(entry: unknown, label: string) => T} parse */
function array(value, label, parse) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, i) => parse(entry, `${label}[${i}]`));
}

/** @template {string} T @param {unknown} value @param {string} label @param {T[]} choices */
function choice(value, label, choices) {
  const found = choices.find((entry) => entry === value);
  if (!found) throw new Error(`${label} must be one of ${choices.join(", ")}`);
  return found;
}

/** @param {unknown} value @param {string} label */
function boolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

/** @param {unknown} value @param {string} label */
export function repoPath(value, label) {
  const path = text(value, label).replace(/\/$/, "");
  if (
    /[\\:*?[\]{}\x00-\x1f]/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    path.split("/").some((part) => part.toLowerCase() === ".git")
  ) {
    throw new Error(`${label} must be a relative literal repository path`);
  }
  return path;
}

/** @param {unknown} value @returns {Plan} */
export function parsePlan(value) {
  const raw = object(value, "plan");
  if (raw.version !== 1) throw new Error("plan.version must be 1");
  const budget = object(raw.budget, "budget");
  const plan = {
    version: /** @type {const} */ (1),
    change: text(raw.change, "change"),
    baseRevision: text(raw.baseRevision, "baseRevision"),
    budget: {
      maxParallel: integer(budget.maxParallel, "maxParallel", 1),
      maxAttempts: integer(budget.maxAttempts, "maxAttempts", 1),
      maxTokens: integer(budget.maxTokens, "maxTokens", 1),
      overheadTokens: integer(budget.overheadTokens, "overheadTokens", 0),
      maxPacketChars: integer(budget.maxPacketChars, "maxPacketChars", 1),
      maxOutputTokens: integer(budget.maxOutputTokens, "maxOutputTokens", 1),
    },
    tasks: array(raw.tasks, "tasks", (value, label) => {
      const task = object(value, label);
      const reads = array(task.reads, `${label}.reads`, (value, label) => {
        const context = object(value, label);
        const start = integer(context.start, `${label}.start`, 1);
        const end = integer(context.end, `${label}.end`, start);
        return { path: repoPath(context.path, `${label}.path`), start, end };
      });
      return {
        id: text(task.id, `${label}.id`),
        title: text(task.title, `${label}.title`),
        instructions: text(task.instructions, `${label}.instructions`),
        dependsOn: array(task.dependsOn, `${label}.dependsOn`, text),
        risk: choice(task.risk, `${label}.risk`, ["low", "medium", "high"]),
        tier: choice(task.tier, `${label}.tier`, [
          "cheap",
          "balanced",
          "strong",
        ]),
        status: choice(task.status, `${label}.status`, [
          "pending",
          "running",
          "done",
          "blocked",
        ]),
        attempts: integer(task.attempts, `${label}.attempts`, 0),
        estimatedTokens: integer(
          task.estimatedTokens,
          `${label}.estimatedTokens`,
          1,
        ),
        chargedTokens: integer(task.chargedTokens, `${label}.chargedTokens`, 0),
        reads,
        writes: array(task.writes, `${label}.writes`, repoPath),
        checks: array(task.checks, `${label}.checks`, text),
        acceptance: array(task.acceptance, `${label}.acceptance`, text),
        reviewed: boolean(task.reviewed, `${label}.reviewed`),
        evidence: array(task.evidence, `${label}.evidence`, text),
      };
    }),
  };
  validateGraph(plan);
  return plan;
}

/** @param {Plan} plan */
function validateGraph(plan) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plan.change)) {
    throw new Error("change must be kebab-case");
  }
  if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(plan.baseRevision)) {
    throw new Error("baseRevision must be a full Git commit hash");
  }
  if (!plan.tasks.length) throw new Error("tasks must not be empty");
  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  if (byId.size !== plan.tasks.length) throw new Error("Duplicate task ID");
  const running = plan.tasks.filter((task) => task.status === "running");
  if (running.length > plan.budget.maxParallel) {
    throw new Error("Running tasks exceed maxParallel");
  }
  for (const task of plan.tasks) {
    if (!/^\d+\.\d+$/.test(task.id))
      throw new Error(`Invalid task ID ${task.id}`);
    if (!task.acceptance.length || !task.checks.length) {
      throw new Error(`${task.id} needs acceptance criteria and checks`);
    }
    if (task.attempts > plan.budget.maxAttempts) {
      throw new Error(`${task.id} exceeds maxAttempts`);
    }
    if (["running", "done"].includes(task.status) && task.attempts === 0) {
      throw new Error(`${task.id} needs an attempt recorded`);
    }
    if (task.status === "done" && (!task.reviewed || !task.evidence.length)) {
      throw new Error(
        `${task.id} needs parent review and verification evidence`,
      );
    }
    for (const id of task.dependsOn) {
      const dependency = byId.get(id);
      if (!dependency)
        throw new Error(`${task.id} has unknown dependency ${id}`);
      if (
        ["running", "done"].includes(task.status) &&
        dependency.status !== "done"
      ) {
        throw new Error(`${task.id} started before dependency ${id} finished`);
      }
    }
  }
  /** @type {Set<string>} */
  const visiting = new Set();
  /** @type {Set<string>} */
  const visited = new Set();
  /** @param {Task} task */
  function visit(task) {
    if (visiting.has(task.id))
      throw new Error(`Dependency cycle at ${task.id}`);
    if (visited.has(task.id)) return;
    visiting.add(task.id);
    for (const id of task.dependsOn) {
      const next = byId.get(id);
      if (next) visit(next);
    }
    visiting.delete(task.id);
    visited.add(task.id);
  }
  plan.tasks.forEach(visit);
  for (let i = 0; i < running.length; i++) {
    for (const other of running.slice(i + 1)) {
      if (conflicts(running[i], other)) {
        throw new Error(
          `Running scope conflict: ${running[i].id}, ${other.id}`,
        );
      }
    }
  }
}

/** @param {Task} task @returns {Tier} */
export function effectiveTier(task) {
  const tiers = /** @type {const} */ (["cheap", "balanced", "strong"]);
  const minimum = task.risk === "high" ? 2 : task.risk === "medium" ? 1 : 0;
  const attempt = task.status === "running" ? task.attempts - 1 : task.attempts;
  return tiers[
    Math.min(2, Math.max(minimum, tiers.indexOf(task.tier) + attempt))
  ];
}

/** @param {string} a @param {string} b */
function overlaps(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** @param {Task} a @param {Task} b */
export function conflicts(a, b) {
  return (
    a.writes.some((path) =>
      [...b.writes, ...b.reads.map((read) => read.path)].some((other) =>
        overlaps(path, other),
      ),
    ) ||
    b.writes.some((path) => a.reads.some((read) => overlaps(path, read.path)))
  );
}

/** @param {Plan} plan */
export function schedule(plan) {
  const running = plan.tasks.filter((task) => task.status === "running");
  const spent =
    plan.budget.overheadTokens +
    plan.tasks.reduce((sum, task) => sum + task.chargedTokens, 0);
  let remaining =
    plan.budget.maxTokens -
    spent -
    running.reduce((sum, task) => sum + task.estimatedTokens, 0);
  /** @type {Task[]} */
  const selected = [];
  /** @type {{id: string, reason: string}[]} */
  const waiting = [];
  for (const task of plan.tasks.filter((task) => task.status === "pending")) {
    let reason = "";
    if (task.attempts >= plan.budget.maxAttempts)
      reason = "attempt budget exhausted";
    else if (
      task.dependsOn.some(
        (id) => plan.tasks.find((entry) => entry.id === id)?.status !== "done",
      )
    )
      reason = "dependencies unfinished";
    else if ([...running, ...selected].some((other) => conflicts(task, other)))
      reason = "read/write scope conflict";
    else if (selected.length + running.length >= plan.budget.maxParallel)
      reason = "concurrency limit";
    else if (task.estimatedTokens > remaining)
      reason = "token budget exhausted";
    if (reason) waiting.push({ id: task.id, reason });
    else {
      selected.push(task);
      remaining -= task.estimatedTokens;
    }
  }
  return {
    ready: selected.map((task) => ({
      id: task.id,
      tier: effectiveTier(task),
      estimatedTokens: task.estimatedTokens,
    })),
    running: running.map((task) => task.id),
    blocked: plan.tasks
      .filter((task) => task.status === "blocked")
      .map((task) => task.id),
    waiting,
    remainingTokensAfterReservations: remaining,
    complete: plan.tasks.every((task) => task.status === "done"),
  };
}

/** @param {Plan} plan @param {string} markdown */
export function validateChecklist(plan, markdown) {
  const lines = markdown.split(/\r?\n/);
  const boxes = lines.filter((line) => /^\s*-\s+\[/.test(line));
  const entries = boxes.map((line) =>
    /^\s*-\s+\[([ xX])\]\s+(\d+\.\d+)\s+\S/.exec(line),
  );
  if (entries.some((entry) => !entry))
    throw new Error("tasks.md needs '- [ ] X.Y Description' checkboxes");
  const checked = new Map(
    entries
      .filter((entry) => entry !== null)
      .map((entry) => [entry[2], entry[1].toLowerCase() === "x"]),
  );
  if (checked.size !== entries.length)
    throw new Error("Duplicate tasks.md checkbox ID");
  if (checked.size !== plan.tasks.length)
    throw new Error("Plan and tasks.md must contain the same task IDs");
  for (const task of plan.tasks) {
    if (
      !checked.has(task.id) ||
      checked.get(task.id) !== (task.status === "done")
    ) {
      throw new Error(`tasks.md and execution plan disagree on ${task.id}`);
    }
  }
}

/** @param {string} path */
export function loadPlan(path) {
  if (statSync(path).size > 1_000_000) throw new Error("Plan exceeds 1 MB");
  const plan = parsePlan(
    /** @type {unknown} */ (JSON.parse(readFileSync(path, "utf8"))),
  );
  validateChecklist(
    plan,
    readFileSync(resolve(dirname(path), "tasks.md"), "utf8"),
  );
  return plan;
}

/** @param {string} root @param {string} path */
function resolveContext(root, path) {
  const realRoot = realpathSync(root);
  const real = realpathSync(resolve(realRoot, path));
  const diff = relative(realRoot, real);
  if (diff === ".." || diff.startsWith(`..${sep}`) || isAbsolute(diff)) {
    throw new Error(`Context escapes repository: ${path}`);
  }
  if (statSync(real).size > 256_000)
    throw new Error(
      `Context file exceeds 256 KB: ${path}; use a smaller source artifact`,
    );
  return real;
}

/** @param {Plan} plan @param {string} id @param {string} root */
export function packet(plan, id, root) {
  const task = plan.tasks.find((task) => task.id === id);
  if (!task) throw new Error(`Unknown task ${id}`);
  const ready = schedule(plan).ready;
  if (!ready.some((entry) => entry.id === id))
    throw new Error(`${id} is not in the ready batch`);
  const context = task.reads.map((read) => {
    const lines = readFileSync(resolveContext(root, read.path), "utf8").split(
      /\r?\n/,
    );
    if (read.end > lines.length)
      throw new Error(`Context range exceeds file: ${read.path}`);
    return {
      ...read,
      content: lines.slice(read.start - 1, read.end).join("\n"),
    };
  });
  const result = {
    change: plan.change,
    baseRevision: plan.baseRevision,
    task: {
      id,
      title: task.title,
      instructions: task.instructions,
      tier: effectiveTier(task),
      writes: task.writes,
      checks: task.checks,
      acceptance: task.acceptance,
    },
    maxOutputTokens: plan.budget.maxOutputTokens,
    estimatedTotalTokens: task.estimatedTokens,
    context,
    dependencies: task.dependsOn.map((id) => {
      const dependency = plan.tasks.find((entry) => entry.id === id);
      return { id, evidence: dependency?.evidence };
    }),
    contract:
      "Work only on this task and permitted writes. Follow repository policy. Do not spawn agents, change plans/checklists, commit, or integrate. Stop on ambiguity or scope expansion. Return status, changed files, check commands and outcomes, risks, usage if available, and patch/worktree location. Parent reviews and integrates.",
  };
  const output = JSON.stringify(result, null, 2);
  if (output.length > plan.budget.maxPacketChars)
    throw new Error(
      `Packet exceeds maxPacketChars (${output.length}); narrow the task or context`,
    );
  return output;
}
