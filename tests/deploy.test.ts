import { describe, expect, it } from "vitest";
import { buildDeployArgs, type DeployConfig } from "../src/lib/deploy.js";

const cfg: DeployConfig = {
  accountId: "acct",
  apiToken: "tok",
  project: "agentlab-pages",
  baseUrl: "https://pages.agentlab.in",
  indexPassword: undefined,
  branch: "main",
};

describe("buildDeployArgs", () => {
  it("pins --branch so a deploy run from a feature branch still lands on production", () => {
    expect(buildDeployArgs(cfg, "/tmp/out")).toEqual([
      "pages",
      "deploy",
      "/tmp/out",
      "--project-name",
      "agentlab-pages",
      "--branch",
      "main",
      "--commit-dirty=true",
    ]);
  });
});
