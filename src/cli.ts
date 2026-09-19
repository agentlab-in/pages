#!/usr/bin/env node
import { createProgram } from "./program.js";

// Development entry point only. This package publishes no bins; users run the
// `alab` binary, which mounts createPagesCommand() under `alab pages`.
const program = createProgram();
program.parseAsync(process.argv).catch((err: unknown) => {
  const e = err as { code?: string };
  if (e?.code === "commander.helpDisplayed" || e?.code === "commander.version") return;
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

export { createPagesCommand, createProgram } from "./program.js";
