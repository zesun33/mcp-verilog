import { ToolRunner } from "../runner.js";
import { parseVeribleOutput } from "../parsers/verible.js";
import { LintResult } from "../parsers/types.js";

export async function runLint(
  runner: ToolRunner,
  files: string[],
  ruleset?: string,
  cwd?: string
): Promise<LintResult> {
  if (files.length === 0) {
    return {
      success: false,
      tool: "verible-verilog-lint",
      diagnostics: [],
      rawOutput: "Error: No files specified for linting.",
    };
  }

  const args: string[] = [];
  if (ruleset) {
    args.push(`--ruleset=${ruleset}`);
  }
  args.push(...files);

  const res = await runner.execute("verible-verilog-lint", args, { cwd });
  const rawCombined = `${res.stdout}\n${res.stderr}`.trim();
  const diagnostics = parseVeribleOutput(rawCombined);

  const hasErrors = diagnostics.some((d) => d.severity === "error");

  return {
    success: res.exitCode === 0 && !hasErrors,
    tool: "verible-verilog-lint",
    diagnostics,
    rawOutput: rawCombined,
  };
}
