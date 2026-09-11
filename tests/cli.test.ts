import { describe, expect, it } from "vitest";
import { createProgram } from "../src/cli.js";

const expectedCommands = ["setup", "put", "remove", "read", "list", "open", "info"];

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
});
