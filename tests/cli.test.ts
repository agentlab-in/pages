import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPagesCommand, createProgram } from "../src/program.js";

const expectedCommands = ["setup", "put", "remove", "read", "list", "open", "info"];
const root = resolve(import.meta.dirname, "..");

function runNode(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("CLI command surfaces", () => {
  it("exposes pages as the only top-level command", () => {
    const program = createProgram();
    expect(program.name()).toBe("alab");
    expect(program.commands.map((command) => command.name())).toEqual(["pages"]);
  });

  it("exposes the mountable pages command for the alab binary", () => {
    const pages = createPagesCommand();
    expect(pages.name()).toBe("pages");
    expect(pages.commands.map((command) => command.name())).toEqual(expectedCommands);
    expect(pages.commands.find((command) => command.name() === "remove")?.aliases()).toContain("delete");
    expect(pages.commands.find((command) => command.name() === "list")?.aliases()).toContain("ls");
  });

  it("mounts the same pages surface on the dev root", () => {
    const program = createProgram();
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

  it("executes root help exactly once with a clean error stream", () => {
    const result = runNode(["src/cli.ts", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.match(/^Usage:/gm)).toHaveLength(1);
    expect(result.stdout).toContain("Usage: alab");
    expect(result.stdout).toContain("pages");
  });

  it("routes pages help with exact successful streams", () => {
    const result = runNode(["src/cli.ts", "pages", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.match(/^Usage:/gm)).toHaveLength(1);
    expect(result.stdout).toContain("Usage: alab pages [options] [command]");
    expect(result.stdout).toContain("put [options] [dir]");
    expect(result.stdout).toContain("alab pages setup");
  });

  it("preserves exact error streams and exit status", () => {
    const result = runNode(["src/cli.ts", "pages", "nope"]);
    const message = "error: unknown command 'nope'\n(Did you mean open?)\n";

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`${message}Error: ${message}`);
  });
});
