import { Diagnostic, DiagnosticSeverity } from "./types.js";

/**
 * Parses stdout/stderr lines from `verible-verilog-lint`.
 * Standard format:
 *   <file>:<line>:<col>: <message> [<rule-name>]
 * or
 *   <file>:<line>: <message> [<rule-name>]
 */
export function parseVeribleOutput(rawOutput: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = rawOutput.split("\n");

  const lineRegex = /^([^:\n]+):(\d+):(?:(\d+):)?\s*(.+?)(?:\s+\[([a-zA-Z0-9_-]+)\])?$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(lineRegex);
    if (!match) continue;

    const [, file, lineStr, colStr, msg, rule] = match;
    const lineNumber = parseInt(lineStr, 10);
    const colNumber = colStr ? parseInt(colStr, 10) : undefined;

    let severity: DiagnosticSeverity = "warning";
    const lowerMsg = msg.toLowerCase();
    if (
      lowerMsg.includes("syntax error") ||
      lowerMsg.includes("error:") ||
      rule === "parser-error"
    ) {
      severity = "error";
    }

    diagnostics.push({
      file,
      line: lineNumber,
      column: colNumber,
      severity,
      message: msg,
      rule: rule ?? undefined,
    });
  }

  return diagnostics;
}
