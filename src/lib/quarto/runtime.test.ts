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
      { cwd: process.cwd(), timeoutMs: 50 },
    );

    expect(result.code).toBe(124);
    expect(result.stderr).toContain("stderr before timeout");
    expect(result.stderr).toContain("timed out");
  });
});
