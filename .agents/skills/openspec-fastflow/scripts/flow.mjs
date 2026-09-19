import { pathToFileURL } from "node:url";
import { loadPlan, packet, schedule } from "./plan.mjs";

/** @param {string[]} args */
export function run(args) {
  const [command, path, id, rootFlag, root] = args;
  if (!path || !["check", "ready", "packet"].includes(command)) {
    throw new Error(
      "Usage: flow.mjs <check|ready> PLAN | packet PLAN TASK_ID --root REPO",
    );
  }
  if (
    command === "packet"
      ? args.length !== 5 || rootFlag !== "--root"
      : args.length !== 2
  ) {
    throw new Error(
      "Unexpected arguments; packet requires TASK_ID --root REPO",
    );
  }
  const plan = loadPlan(path);
  return command === "packet"
    ? packet(plan, id, root)
    : JSON.stringify(
        command === "ready"
          ? schedule(plan)
          : { valid: true, tasks: plan.tasks.length },
        null,
        2,
      );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(run(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
