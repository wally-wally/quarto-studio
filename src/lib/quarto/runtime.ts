import { spawn } from "node:child_process";

export type ProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeoutMessage = `Render timed out after ${options.timeoutMs}ms`;
    let settled = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: ProcessResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      resolve(result);
    };

    const timeout = setTimeout(() => {
      timedOut = true;

      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 500);
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });

    child.on("error", (error) => {
      finish({
        code: 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: error.message,
      });
    });

    child.on("close", (code) => {
      const capturedStderr = Buffer.concat(stderr).toString("utf8");

      finish({
        code: timedOut ? 124 : (code ?? 1),
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: timedOut
          ? [capturedStderr.trimEnd(), timeoutMessage].filter(Boolean).join("\n")
          : capturedStderr,
      });
    });
  });
}
