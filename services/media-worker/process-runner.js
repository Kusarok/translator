import { spawn } from "node:child_process";

export const runProcess = ({ command, args, timeoutMs, onLine }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let buffer = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Media processing timed out."));
    }, timeoutMs);

    const lines = (chunk) => {
      const text = chunk.toString();
      stdout += text;
      buffer += text;
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() || "";
      for (const line of parts) onLine?.(line);
    };

    child.stdout.on("data", lines);
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) reject(error);
      settled = true;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (buffer) onLine?.(buffer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(cleanError(stderr || stdout, code)));
    });
  });

const cleanError = (output, code) => {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const useful = lines.reverse().find((line) => /error|unsupported|unavailable|login|private|copyright/i.test(line));
  return (useful || `Media tool exited with code ${code}`).replace(/^ERROR:\s*/i, "").slice(0, 500);
};
