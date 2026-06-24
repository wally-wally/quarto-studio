import { spawn } from "node:child_process";

const KILL_ESCALATION_DELAY_MS = 100;

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
    const useProcessGroup = process.platform !== "win32";
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: useProcessGroup,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeoutMessage = `Render timed out after ${options.timeoutMs}ms`;
    let settled = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    const isAlreadyExitedError = (error: unknown) =>
      (error as NodeJS.ErrnoException).code === "ESRCH";

    const signalProcess = (signal: NodeJS.Signals) => {
      if (useProcessGroup && child.pid) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch (error) {
          if (isAlreadyExitedError(error)) {
            return;
          }
        }
      }

      try {
        child.kill(signal);
      } catch (error) {
        if (!isAlreadyExitedError(error)) {
          return;
        }
      }
    };

    const finish = (result: ProcessResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (killTimer && !timedOut) {
        clearTimeout(killTimer);
        killTimer = null;
      }
      resolve(result);
    };

    const timeout = setTimeout(() => {
      timedOut = true;

      signalProcess("SIGTERM");
      killTimer = setTimeout(() => {
        killTimer = null;
        signalProcess("SIGKILL");
      }, KILL_ESCALATION_DELAY_MS);
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
