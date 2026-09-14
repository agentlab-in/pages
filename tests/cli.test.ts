import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createProgram } from "../src/program.js";

const expectedCommands = ["setup", "put", "remove", "read", "list", "open", "info"];
const root = resolve(import.meta.dirname, "..");

function runNode(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("CLI command surfaces", () => {
  it("exposes direct standalone commands", () => {
    const program = createProgram();
    expect(program.commands.map((command) => command.name())).toEqual(expectedCommands);
    expect(program.commands.find((command) => command.name() === "remove")?.aliases()).toContain("delete");
    expect(program.commands.find((command) => command.name() === "list")?.aliases()).toContain("ls");
  });

  it("retains the alab pages compatibility route", () => {
    const program = createProgram({ legacyAlab: true });
    const pages = program.commands.find((command) => command.name() === "pages");
    expect(pages?.commands.map((command) => command.name())).toEqual(expectedCommands);
  });

  it("imports the integration program without parsing or mutating process output", () => {
    const result = runNode([
      "--input-type=module",
      "--eval",
      "await import('./src/program.ts')",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("executes help exactly once with a clean error stream", () => {
    const result = runNode(["src/cli.ts", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.match(/^Usage:/gm)).toHaveLength(1);
    expect(result.stdout).toContain("agentlab-pages setup");
    expect(result.stdout).toContain("agentlab-pages put <directory>");
  });

  it("preserves exact error streams and exit status", () => {
    const result = runNode(["src/cli.ts", "nope"]);
    const message = "error: unknown command 'nope'\n(Did you mean open?)\n";

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`${message}Error: ${message}`);
  });
});
