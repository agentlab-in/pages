import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalState,
  readLocalState,
  writeLocalState,
} from "../src/lib/state.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alab-state-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("local state", () => {
  it("round-trips pages.json", () => {
    writeLocalState(tmp, {
      id: "abc123",
      url: "https://pages.agentlab.in/abc123/",
    });
    expect(readLocalState(tmp)).toEqual({
      id: "abc123",
      url: "https://pages.agentlab.in/abc123/",
    });
    clearLocalState(tmp);
    expect(readLocalState(tmp)).toBeNull();
  });
});
