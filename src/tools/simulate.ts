import { ToolRunner } from "../runner.js";
import { extractSimulationErrors, parseIverilogOutput } from "../parsers/iverilog.js";
import { SimulationResult } from "../parsers/types.js";

export async function runSimulate(
  runner: ToolRunner,
  files: string[],
  topModule?: string,
  timeoutMs: number = 15000,
  dumpWaves: boolean = false,
  cwd?: string
): Promise<SimulationResult> {
  if (files.length === 0) {
    return {
      success: false,
      exitCode: 1,
      timedOut: false,
      stdout: "",
      stderr: "Error: No files specified for simulation.",
      errors: ["No files specified."],
    };
  }

  // Step 1: Compile to temporary vvp file
  const simOutputFile = "build_sim.vvp";
  const compileArgs = ["-o", simOutputFile];
  if (topModule) {
    compileArgs.push("-s", topModule);
  }
  compileArgs.push(...files);

  const compileRes = await runner.execute("iverilog", compileArgs, { cwd });
  if (compileRes.exitCode !== 0) {
    const compileDiags = parseIverilogOutput(`${compileRes.stdout}\n${compileRes.stderr}`);
    return {
      success: false,
      exitCode: compileRes.exitCode,
      timedOut: false,
      stdout: compileRes.stdout,
      stderr: compileRes.stderr,
      errors: compileDiags.map((d) => `${d.file}:${d.line}: ${d.message}`),
    };
  }

  // Step 2: Run simulation using vvp
  const vvpArgs = [simOutputFile];
  const simRes = await runner.execute("vvp", vvpArgs, { cwd, timeoutMs });

  const rawCombined = `${simRes.stdout}\n${simRes.stderr}`;
  const simErrors = extractSimulationErrors(rawCombined);

  if (simRes.timedOut) {
    simErrors.push(`Simulation timed out after ${timeoutMs}ms.`);
  }

  const success = simRes.exitCode === 0 && !simRes.timedOut && simErrors.length === 0;

  return {
    success,
    exitCode: simRes.exitCode,
    timedOut: simRes.timedOut,
    stdout: simRes.stdout,
    stderr: simRes.stderr,
    vcdPath: dumpWaves ? "waves.vcd" : undefined,
    errors: simErrors,
  };
}
