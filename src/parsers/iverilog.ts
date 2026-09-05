import { Diagnostic, DiagnosticSeverity } from "./types.js";

/**
 * Parses stderr/stdout from Icarus Verilog (`iverilog`).
 * Formats:
 *   <file>:<line>: error: <message>
 *   <file>:<line>: warning: <message>
 *   <file>:<line>: syntax error
 *   <file>:<line>: <message>
 */
export function parseIverilogOutput(rawOutput: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = rawOutput.split("\n");

  const diagRegex = /^([^:\n]+):(\d+):\s*(?:(error|warning):)?\s*(.+)$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(diagRegex);
    if (!match) continue;

    const [, file, lineStr, sevStr, msg] = match;
    const lineNumber = parseInt(lineStr, 10);

    let severity: DiagnosticSeverity = "error";
    if (sevStr && sevStr.toLowerCase() === "warning") {
      severity = "warning";
    }

    diagnostics.push({
      file,
      line: lineNumber,
      severity,
      message: msg.trim(),
    });
  }

  return diagnostics;
}

/**
 * Extracts assertion failures and fatal stops from `vvp` simulation stdout/stderr.
 */
export function extractSimulationErrors(output: string): string[] {
  const errors: string[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("$fatal") ||
      trimmed.includes("FATAL") ||
      trimmed.startsWith("ERROR:") ||
      trimmed.includes("Assertion failed") ||
      trimmed.includes("FAILED")
    ) {
      errors.push(trimmed);
    }
  }

  return errors;
}
