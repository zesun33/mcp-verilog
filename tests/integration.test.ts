import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { ToolRunner } from "../src/runner.js";
import { runLint } from "../src/tools/lint.js";
import { runCompile } from "../src/tools/compile.js";
import { runSimulate } from "../src/tools/simulate.js";
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
