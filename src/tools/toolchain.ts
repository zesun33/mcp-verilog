import { ToolRunner } from "../runner.js";
import { ToolchainInfo, ToolchainVersion } from "../parsers/types.js";

export async function getToolchainInfo(runner: ToolRunner): Promise<ToolchainInfo> {
  const tools: ToolchainVersion[] = [];

  // Check iverilog
  const iverilogRes = await runner.execute("iverilog", ["-V"]);
  tools.push({
    name: "iverilog",
    available: iverilogRes.exitCode === 0,
    version: iverilogRes.stdout.split("\n")[0] || "Unknown",
  });

  // Check verilator
  const verilatorRes = await runner.execute("verilator", ["--version"]);
  tools.push({
    name: "verilator",
    available: verilatorRes.exitCode === 0,
    version: verilatorRes.stdout.trim() || "Unknown",
  });

  // Check verible-verilog-lint
  const veribleRes = await runner.execute("verible-verilog-lint", ["--version"]);
  tools.push({
    name: "verible-verilog-lint",
    available: veribleRes.exitCode === 0,
    version: veribleRes.stdout.split("\n")[0] || "Unknown",
  });

  // Check sv2v
  const sv2vRes = await runner.execute("sv2v", ["--version"]);
  tools.push({
    name: "sv2v",
    available: sv2vRes.exitCode === 0,
    version: sv2vRes.stdout.trim() || "Unknown",
  });

  return {
    runtime: runner.getRuntime(),
    image: runner.getRuntime() !== "host" ? runner.getImageName() : undefined,
    tools,
  };
}
