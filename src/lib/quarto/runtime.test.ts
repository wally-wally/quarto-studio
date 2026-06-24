import { describe, expect, it } from "vitest";
import { runProcess } from "./runtime";

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
});
