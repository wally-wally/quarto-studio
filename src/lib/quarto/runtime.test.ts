import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProcess } from "./runtime";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("runProcess", () => {
  it("timeout이 발생해도 이미 캡처한 stderr를 보존한다", async () => {
    const result = await runProcess(
      process.execPath,
      [
        "-e",
        "process.stderr.write('stderr before timeout'); setTimeout(() => {}, 1000);",
      ],
      { cwd: process.cwd(), timeoutMs: 150 },
    );

    expect(result.code).toBe(124);
    expect(result.stderr).toContain("stderr before timeout");
    expect(result.stderr).toContain("timed out");
  });

  it("timeout 이후 프로세스 close까지 기다려 종료 중 출력된 로그를 포함한다", async () => {
    const result = await runProcess(
      process.execPath,
      [
        "-e",
        [
          "process.stderr.write('stderr before timeout\\n');",
          "process.on('SIGTERM', () => {",
          "  process.stdout.write('stdout during shutdown');",
          "  process.stderr.write('stderr during shutdown');",
          "  setTimeout(() => process.exit(0), 50);",
          "});",
          "setTimeout(() => {}, 1000);",
        ].join(" "),
      ],
      { cwd: process.cwd(), timeoutMs: 150 },
    );

    expect(result.code).toBe(124);
    expect(result.stdout).toContain("stdout during shutdown");
    expect(result.stderr).toContain("stderr before timeout");
    expect(result.stderr).toContain("stderr during shutdown");
    expect(result.stderr).toContain("timed out");
  });

  const itOnPosix = process.platform === "win32" ? it.skip : it;

  itOnPosix("timeout이 발생하면 SIGTERM을 무시하는 하위 프로세스까지 SIGKILL로 종료한다", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quarto-runtime-"));
    const heartbeatPath = path.join(tempDir, "heartbeat");
    const childPidPath = path.join(tempDir, "child.pid");

    const childCode = [
      "const fs = require('node:fs');",
      "const heartbeatPath = process.argv[1];",
      "const childPidPath = process.argv[2];",
      "process.on('SIGTERM', () => {});",
      "fs.writeFileSync(childPidPath, String(process.pid));",
      "const writeHeartbeat = () => fs.writeFileSync(heartbeatPath, String(Date.now()));",
      "writeHeartbeat();",
      "setInterval(writeHeartbeat, 40);",
    ].join(" ");
    const parentCode = [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      `const childCode = ${JSON.stringify(childCode)};`,
      "const [heartbeatPath, childPidPath] = process.argv.slice(1);",
      "spawn(process.execPath, ['-e', childCode, heartbeatPath, childPidPath], { stdio: 'ignore' });",
      "const waitForChild = () => {",
      "  if (fs.existsSync(heartbeatPath) && fs.existsSync(childPidPath)) {",
      "    process.stdout.write('child ready\\n');",
      "    setInterval(() => {}, 1000);",
      "    return;",
      "  }",
      "  setTimeout(waitForChild, 10);",
      "};",
      "waitForChild();",
    ].join(" ");

    let childPid: number | null = null;

    try {
      const result = await runProcess(
        process.execPath,
        ["-e", parentCode, heartbeatPath, childPidPath],
        { cwd: process.cwd(), timeoutMs: 600 },
      );

      expect(result.stdout).toContain("child ready");
      childPid = Number(await fs.readFile(childPidPath, "utf8"));
      await wait(120);
      const before = await fs.stat(heartbeatPath);
      await wait(120);
      const after = await fs.stat(heartbeatPath);

      expect(result.code).toBe(124);
      expect(after.mtimeMs).toBe(before.mtimeMs);
    } finally {
      if (childPid) {
        try {
          process.kill(childPid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
            throw error;
          }
        }
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
