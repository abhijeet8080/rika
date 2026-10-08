import { runLifecycleCleanup } from "../lib/lifecycle/cleanup";

runLifecycleCleanup().then((result) => console.log(result)).catch((error) => {
  console.error("Lifecycle cleanup failed", error);
  process.exitCode = 1;
});
