#!/usr/bin/env node
import { runCli } from "./program.js";

runCli().catch((err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

export { createProgram, runCli } from "./program.js";
