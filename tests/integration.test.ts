import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs";
import { ToolRunner } from "../src/runner.js";
import { runLint } from "../src/tools/lint.js";
import { runCompile } from "../src/tools/compile.js";
import { runSimulate } from "../src/tools/simulate.js";
import { runWaveSummary } from "../src/tools/wave.js";
import { runCoverage } from "../src/tools/coverage.js";
import { runGenerateTestbench } from "../src/tools/generate_tb.js";
import { getToolchainInfo } from "../src/tools/toolchain.js";

const runner = new ToolRunner();
const fixturesDir = path.resolve("fixtures");

test("Integration: verilog_toolchain_info queries container tool versions", async () => {
  const info = await getToolchainInfo(runner);
  assert.equal(info.runtime, "podman");

  const iverilog = info.tools.find((t) => t.name === "iverilog");
  assert.ok(iverilog?.available, "iverilog should be available in container");

  const verilator = info.tools.find((t) => t.name === "verilator");
  assert.ok(verilator?.available, "verilator should be available in container");

  const verible = info.tools.find((t) => t.name === "verible-verilog-lint");
  assert.ok(verible?.available, "verible should be available in container");
});

test("Integration: verilog_compile validates correct counter", async () => {
  const res = await runCompile(runner, ["fixtures/counter.v"], undefined, "iverilog", process.cwd());
  assert.equal(res.success, true, `Compile failed: ${res.rawOutput}`);
  assert.equal(res.diagnostics.length, 0);
});

test("Integration: verilog_compile catches syntax errors in broken module", async () => {
  const res = await runCompile(runner, ["fixtures/syntax_error.v"], undefined, "iverilog", process.cwd());
  assert.equal(res.success, false);
  assert.ok(res.diagnostics.length > 0, "Should have diagnostics for syntax error");
  assert.ok(res.diagnostics.some((d) => d.severity === "error"));
});

test("Integration: verilog_lint checks formatting and syntax", async () => {
  const res = await runLint(runner, ["fixtures/syntax_error.v"], undefined, process.cwd());
  assert.equal(res.success, false);
  assert.ok(res.diagnostics.length > 0);
  assert.ok(res.diagnostics.some((d) => d.rule === "parser-error" || d.severity === "error"));
});

test("Integration: verilog_simulate runs passing counter testbench", async () => {
  const res = await runSimulate(
    runner,
    ["fixtures/counter.v", "fixtures/counter_tb.v"],
    "counter_tb",
    10000,
    false,
    process.cwd()
  );

  assert.equal(res.success, true, `Simulation failed: ${res.stderr}`);
  assert.equal(res.timedOut, false);
  assert.ok(res.stdout.includes("PASS: Counter testbench completed"), `Expected pass message, got: ${res.stdout}`);
});

test("Integration: verilog_simulate catches fatal assertion failure", async () => {
  const res = await runSimulate(
    runner,
    ["fixtures/failing_tb.v"],
    "failing_tb",
    5000,
    false,
    process.cwd()
  );

  assert.equal(res.success, false);
  assert.ok(res.errors.length > 0, "Should capture fatal error");
  assert.ok(res.errors.some((e) => e.includes("fatal") || e.includes("ASSERTION_FAILED")));
});

test("Integration: verilog_wave_summary summarizes VCD from wave demo", async () => {
  const simRes = await runSimulate(
    runner,
    ["fixtures/counter.v", "fixtures/wave_demo_tb.v"],
    "wave_demo_tb",
    10000,
    true,
    process.cwd()
  );
  assert.equal(simRes.success, true, `Wave demo simulation failed: ${simRes.stderr}`);

  const summary = await runWaveSummary("waves.vcd", 30, process.cwd());
  assert.equal(summary.success, true, `Wave summary failed: ${summary.errors.join("; ")}`);
  assert.ok(summary.signalCount > 0, "Should discover dumped signals");
  assert.match(summary.timescale, /1ps/); // iverilog VCD timescale = precision from `timescale 1ns/1ps
  const clk = summary.signals.find((s) => s.name.endsWith("clk"));
  assert.ok(clk, "Should include clock signal");
  assert.ok(clk.transitions > 0, "Clock should toggle");

  await fs.promises.rm(path.join(process.cwd(), "waves.vcd"), { force: true });
  await fs.promises.rm(path.join(process.cwd(), "build_sim.vvp"), { force: true });
});

test("Integration: verilog_wave_summary rejects missing VCD", async () => {
  const summary = await runWaveSummary("does-not-exist.vcd", 30, process.cwd());
  assert.equal(summary.success, false);
  assert.ok(summary.errors.length > 0);
});

test("Integration: verilog_coverage measures wave demo testbench", async () => {
  const res = await runCoverage(
    runner,
    ["fixtures/counter.v", "fixtures/wave_demo_tb.v"],
    "wave_demo_tb",
    process.cwd(),
    240000
  );
  assert.equal(res.success, true, `Coverage failed: ${res.errors.join("; ")}`);
  assert.ok(res.linesTotal > 0, "Should report coverable lines");
  assert.ok(res.linesCovered > 0, "Wave demo should cover design lines");
  assert.ok(res.files.some((f) => f.file.endsWith("counter.v")));
});

test("Integration: verilog_coverage rejects invalid top module", async () => {
  const res = await runCoverage(runner, ["fixtures/counter.v"], "not a module!", process.cwd());
  assert.equal(res.success, false);
  assert.ok(res.errors.length > 0);
});

test("Integration: verilog_generate_tb round-trips through simulation", async () => {
  const gen = await runGenerateTestbench(
    ["fixtures/counter.v"],
    "counter",
    10,
    "gen_counter_tb.v",
    process.cwd()
  );
  assert.equal(gen.success, true, `TB gen failed: ${gen.errors.join("; ")}`);
  assert.equal(gen.testbenchModule, "counter_tb");
  assert.equal(gen.clockPort, "clk");
  assert.equal(gen.resetPort, "rst");

  const simRes = await runSimulate(
    runner,
    ["fixtures/counter.v", "gen_counter_tb.v"],
    "counter_tb",
    10000,
    false,
    process.cwd()
  );
  assert.equal(simRes.success, true, `Generated TB simulation failed: ${simRes.stderr}`);
  assert.ok(simRes.stdout.includes("PASS: counter smoke test completed"));

  await fs.promises.rm(path.join(process.cwd(), "gen_counter_tb.v"), { force: true });
  await fs.promises.rm(path.join(process.cwd(), "counter_tb.vcd"), { force: true });
  await fs.promises.rm(path.join(process.cwd(), "build_sim.vvp"), { force: true });
});

test("Integration: verilog_generate_tb rejects unknown module", async () => {
  const gen = await runGenerateTestbench(["fixtures/counter.v"], "nope_missing", 10, undefined, process.cwd());
  assert.equal(gen.success, false);
  assert.ok(gen.errors.length > 0);
});
