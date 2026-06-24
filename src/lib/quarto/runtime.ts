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
    let settled = false;

    const finish = (result: ProcessResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      const capturedStderr = Buffer.concat(stderr).toString("utf8").trimEnd();
      const timeoutMessage = `Render timed out after ${options.timeoutMs}ms`;

      child.kill("SIGTERM");
      finish({
        code: 124,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: [capturedStderr, timeoutMessage].filter(Boolean).join("\n"),
      });
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
      finish({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}
