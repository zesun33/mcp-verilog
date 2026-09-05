import { Diagnostic, DiagnosticSeverity } from "./types.js";

/**
 * Parses Verilator diagnostic output.
 * Formats:
 *   %Error: <file>:<line>:<col>: <message>
 *   %Warning-<RULE>: <file>:<line>:<col>: <message>
 */
export function parseVerilatorOutput(rawOutput: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = rawOutput.split("\n");

  const verilatorRegex = /^%(Error|Warning(?:-([A-Z0-9_]+))?):\s*([^:\n]+):(\d+):(?:(\d+):)?\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(verilatorRegex);
    if (!match) continue;

    const [, typeStr, rule, file, lineStr, colStr, msg] = match;
    const lineNumber = parseInt(lineStr, 10);
    const colNumber = colStr ? parseInt(colStr, 10) : undefined;
    const severity: DiagnosticSeverity = typeStr.startsWith("Error") ? "error" : "warning";

    diagnostics.push({
      file,
      line: lineNumber,
      column: colNumber,
      severity,
      message: msg.trim(),
      rule: rule ?? undefined,
    });
  }

  return diagnostics;
}
