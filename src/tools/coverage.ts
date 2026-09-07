import * as fs from "node:fs";
import * as path from "node:path";
import { ToolRunner } from "../runner.js";
import { parseCoverageInfo } from "../parsers/coverage.js";
import { parseVerilatorOutput } from "../parsers/verilator.js";
import { extractSimulationErrors } from "../parsers/iverilog.js";
import { CoverageResult } from "../parsers/types.js";

const TOP_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const BUILD_TIMEOUT_MS = 180000;
const RUN_TIMEOUT_MS = 60000;

function mainSource(topModule: string, datFile: string): string {
  return `#include "V${topModule}.h"
#include "verilated.h"
#include "verilated_cov.h"
int main(int argc, char** argv) {
    VerilatedContext* contextp = new VerilatedContext;
    contextp->commandArgs(argc, argv);
    V${topModule}* top = new V${topModule}{contextp};
    while (!contextp->gotFinish()) { contextp->timeInc(1); top->eval(); }
    VerilatedCov::write("${datFile}");
    delete top;
    delete contextp;
    return 0;
}
`;
}

/**
 * Measures Verilog line coverage via Verilator (`--coverage --cc --timing`
 * build of a `$finish`-terminated testbench + `verilator_coverage` report).
 * Builds in an isolated `obj_cov_<top>` dir and cleans all artifacts.
 */
export async function runCoverage(
  runner: ToolRunner,
  files: string[],
  topModule: string,
  cwd?: string,
  timeoutMs: number = BUILD_TIMEOUT_MS
): Promise<CoverageResult> {
  const fail = (errors: string[]): CoverageResult => ({
    success: false,
    topModule,
    linesTotal: 0,
    linesCovered: 0,
    coveragePct: 0,
    files: [],
    simErrors: [],
    errors,
  });

  if (files.length === 0) return fail(["No files specified for coverage."]);
  if (!topModule || !TOP_RE.test(topModule)) {
    return fail([`Invalid top module name: "${topModule}".`]);
  }

  const base = path.resolve(cwd || process.cwd());
  const safeTop = topModule.replace(/\$/g, "_");
  const mdir = `obj_cov_${safeTop}`;
  const mainFile = `cov_main_${safeTop}.cpp`;
  const datFile = `coverage_${safeTop}.dat`;
  const infoFile = `coverage_${safeTop}.info`;
  const binary = `V${topModule}`;

  // Generated main + artifacts are cleaned up to keep the workspace tidy.
  const cleanup = async () => {
    await fs.promises.rm(path.join(base, mdir), { recursive: true, force: true });
    for (const f of [mainFile, datFile, infoFile]) {
      await fs.promises.rm(path.join(base, f), { force: true });
    }
  };

  try {
    await fs.promises.writeFile(path.join(base, mainFile), mainSource(topModule, datFile));

    const buildRes = await runner.execute(
      "verilator",
      [
        "--coverage",
        "--cc",
        "--timing",
        "-j",
        "4",
        "-Wno-TIMESCALEMOD",
        "--top-module",
        topModule,
        "--Mdir",
        mdir,
        "--exe",
        mainFile,
        ...files,
      ],
      { cwd: base, timeoutMs }
    );
    if (buildRes.exitCode !== 0) {
      const diags = parseVerilatorOutput(`${buildRes.stdout}\n${buildRes.stderr}`);
      return fail([
        `Verilator coverage build failed (exit ${buildRes.exitCode}).`,
        ...diags.map((d) => `${d.file}:${d.line}: ${d.message}`).slice(0, 10),
      ]);
    }

    const makeRes = await runner.execute(
      "make",
      ["-C", mdir, "-f", `${binary}.mk`, "-j", "4"],
      { cwd: base, timeoutMs }
    );
    if (makeRes.exitCode !== 0) {
      return fail([
        `Coverage model compile failed (exit ${makeRes.exitCode}).`,
        ...makeRes.stderr.split("\n").map((l) => l.trim()).filter(Boolean).slice(-5),
      ]);
    }

    const runRes = await runner.execute(`./${mdir}/${binary}`, [], {
      cwd: base,
      timeoutMs: Math.min(timeoutMs, RUN_TIMEOUT_MS),
    });
    const simErrors = extractSimulationErrors(`${runRes.stdout}\n${runRes.stderr}`);
    if (runRes.timedOut) simErrors.push(`Coverage run timed out.`);
    if (runRes.exitCode !== 0 && simErrors.length === 0) {
      simErrors.push(`Simulation binary exited with code ${runRes.exitCode}.`);
    }

    const infoRes = await runner.execute(
      "verilator_coverage",
      ["--write-info", infoFile, datFile],
      { cwd: base, timeoutMs: 30000 }
    );
    if (infoRes.exitCode !== 0) {
      return fail([
        `verilator_coverage failed (exit ${infoRes.exitCode}); simulation may not have written ${datFile}.`,
        ...simErrors,
      ]);
    }

    let rawInfo: string;
    try {
      rawInfo = await fs.promises.readFile(path.join(base, infoFile), "utf-8");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return fail([`Cannot read coverage report: ${message}`, ...simErrors]);
    }

    const fileStats = parseCoverageInfo(rawInfo);
    const linesTotal = fileStats.reduce((n, f) => n + f.linesTotal, 0);
    const linesCovered = fileStats.reduce((n, f) => n + f.linesCovered, 0);

    return {
      success: simErrors.length === 0,
      topModule,
      linesTotal,
      linesCovered,
      coveragePct: linesTotal === 0 ? 0 : Math.round((linesCovered / linesTotal) * 1000) / 10,
      files: fileStats,
      simErrors,
      errors: [],
    };
  } finally {
    await cleanup();
  }
}
