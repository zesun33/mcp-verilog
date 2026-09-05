import { ToolRunner } from "../runner.js";
import { parseIverilogOutput } from "../parsers/iverilog.js";
import { parseVerilatorOutput } from "../parsers/verilator.js";
import { CompileResult } from "../parsers/types.js";

export async function runCompile(
  runner: ToolRunner,
  files: string[],
  topModule?: string,
  compiler: "iverilog" | "verilator" = "iverilog",
  cwd?: string
): Promise<CompileResult> {
  if (files.length === 0) {
    return {
      success: false,
      compiler,
      diagnostics: [],
      rawOutput: "Error: No files specified for compilation.",
    };
  }

  if (compiler === "verilator") {
    const args = ["--lint-only", "-Wall"];
    if (topModule) {
      args.push(`--top-module`, topModule);
    }
    args.push(...files);

    const res = await runner.execute("verilator", args, { cwd });
    const rawCombined = `${res.stdout}\n${res.stderr}`.trim();
    const diagnostics = parseVerilatorOutput(rawCombined);

    return {
      success: res.exitCode === 0 && !diagnostics.some((d) => d.severity === "error"),
      compiler: "verilator",
      diagnostics,
      rawOutput: rawCombined,
    };
  }

  // Default: iverilog
  const args = ["-t", "null"];
  if (topModule) {
    args.push("-s", topModule);
  }
  args.push(...files);

  const res = await runner.execute("iverilog", args, { cwd });
  const rawCombined = `${res.stdout}\n${res.stderr}`.trim();
  const diagnostics = parseIverilogOutput(rawCombined);

  return {
    success: res.exitCode === 0 && diagnostics.length === 0,
    compiler: "iverilog",
    diagnostics,
    rawOutput: rawCombined,
  };
}
