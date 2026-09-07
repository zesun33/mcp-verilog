import test from "node:test";
import assert from "node:assert/strict";
import { parseVeribleOutput } from "../src/parsers/verible.js";
import { parseIverilogOutput, extractSimulationErrors } from "../src/parsers/iverilog.js";
import { parseVerilatorOutput } from "../src/parsers/verilator.js";
import { parseVcdSummary } from "../src/parsers/vcd.js";
import { parseCoverageInfo } from "../src/parsers/coverage.js";
import { parseModulePorts, generateTestbench } from "../src/tools/generate_tb.js";

test("parseVeribleOutput parses standard verible lint lines", () => {
  const sample = `
counter.v:14:5: syntax error, rejected 'end' [parser-error]
counter.v:22:1: Always body should be in a begin/end block. [always-body-block]
`;
  const diags = parseVeribleOutput(sample);
  assert.equal(diags.length, 2);

  assert.equal(diags[0].file, "counter.v");
  assert.equal(diags[0].line, 14);
  assert.equal(diags[0].column, 5);
  assert.equal(diags[0].severity, "error");
  assert.equal(diags[0].rule, "parser-error");

  assert.equal(diags[1].file, "counter.v");
  assert.equal(diags[1].line, 22);
  assert.equal(diags[1].column, 1);
  assert.equal(diags[1].severity, "warning");
  assert.equal(diags[1].rule, "always-body-block");
});

test("parseIverilogOutput parses compiler syntax and elaboration errors", () => {
  const sample = `
fixtures/syntax_error.v:9: syntax error
fixtures/syntax_error.v:9: error: malformed statement
fixtures/syntax_error.v:12: warning: Port 'out' not assigned in all paths
`;
  const diags = parseIverilogOutput(sample);
  assert.equal(diags.length, 3);

  assert.equal(diags[0].file, "fixtures/syntax_error.v");
  assert.equal(diags[0].line, 9);
  assert.equal(diags[0].severity, "error");

  assert.equal(diags[1].severity, "error");
  assert.equal(diags[2].severity, "warning");
});

test("parseVerilatorOutput parses error and warning flags", () => {
  const sample = `
%Error: counter.v:10:5: syntax error, unexpected endmodule
%Warning-UNUSED: counter.v:3:16: Signal is not used: 'unused_wire'
`;
  const diags = parseVerilatorOutput(sample);
  assert.equal(diags.length, 2);

  assert.equal(diags[0].file, "counter.v");
  assert.equal(diags[0].line, 10);
  assert.equal(diags[0].column, 5);
  assert.equal(diags[0].severity, "error");

  assert.equal(diags[1].file, "counter.v");
  assert.equal(diags[1].line, 3);
  assert.equal(diags[1].severity, "warning");
  assert.equal(diags[1].rule, "UNUSED");
});

test("extractSimulationErrors detects fatal stops and assertions", () => {
  const sample = `
VCD info: dumpfile waves.vcd opened for output.
Time=10ns clk=1 rst=0
$fatal: at 25ns: SIMULATION_ASSERTION_FAILED: Test intentional failure.
ERROR: Assertion failed at line 42
PASS: normal output
`;
  const errors = extractSimulationErrors(sample);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /fatal/i);
  assert.match(errors[1], /Assertion failed/i);
});

test("parseVcdSummary summarizes scalar and vector toggles", () => {
  const sample = `
$timescale 1ns $end
$scope module top $end
$var wire 1 ! clk $end
$var wire 8 " count [7:0] $end
$upscope $end
$enddefinitions $end
#0
0!
b00000000 "
#5
1!
#10
0!
b00000001 "
#15
1!
`;
  const parsed = parseVcdSummary(sample, 10);
  assert.equal(parsed.timescale, "1ns");
  assert.equal(parsed.timeStart, 0);
  assert.equal(parsed.timeEnd, 15);
  assert.equal(parsed.signals.length, 2);
  // clk toggles most: first in most-active-first order
  assert.equal(parsed.signals[0].name, "top.clk");
  assert.equal(parsed.signals[0].transitions, 4);
  assert.equal(parsed.signals[0].toggled, true);
  assert.equal(parsed.signals[1].name, "top.count");
  assert.equal(parsed.signals[1].width, 8);
  assert.equal(parsed.signals[1].transitions, 2);
});

test("parseVcdSummary caps output to maxSignals", () => {  const sample = `
$scope module top $end
$var wire 1 ! a $end
$var wire 1 " b $end
$var wire 1 # c $end
$upscope $end
$enddefinitions $end
#0
0!
0"
0#
#5
1!
`;
  const parsed = parseVcdSummary(sample, 2);
  assert.equal(parsed.signals.length, 2);
  assert.equal(parsed.signals[0].name, "top.a");
});

test("parseVcdSummary reads multi-line iverilog timescale blocks", () => {
  const sample = `
$timescale
    1ns
$end
$scope module tb $end
$var wire 1 ! clk $end
$upscope $end
$enddefinitions $end
#0
0!
#5
1!
`;
  const parsed = parseVcdSummary(sample, 10);
  assert.equal(parsed.timescale, "1ns");
  assert.equal(parsed.signals.length, 1);
  assert.equal(parsed.signals[0].transitions, 2);
});

test("parseCoverageInfo computes per-file covered lines", () => {
  const sample = `
TN:verilator_coverage
SF:counter.v
DA:5,14
DA:6,2
DA:8,0
end_of_record
SF:counter_tb.v
DA:18,1
end_of_record
`;
  const files = parseCoverageInfo(sample);
  assert.equal(files.length, 2);
  assert.equal(files[0].file, "counter.v");
  assert.equal(files[0].linesTotal, 3);
  assert.equal(files[0].linesCovered, 2);
  assert.deepEqual(files[0].uncoveredLines, [8]);
  assert.equal(files[1].linesCovered, 1);
});

test("parseModulePorts parses ANSI ports with shared direction", () => {
  const src = `
module counter #(parameter WIDTH = 8)(
    input  wire             clk,
    input  wire             rst,
    input  wire             enable,
    output reg  [WIDTH-1:0] count
);
endmodule
`;
  // NOTE: parameterized widths resolve to 1 without elaboration; literal test below.
  const ports = parseModulePorts(src, "counter");
  assert.equal(ports.length, 4);
  assert.deepEqual(ports[0], { name: "clk", direction: "input", width: 1 });
  assert.equal(ports[3].name, "count");
  assert.equal(ports[3].direction, "output");
});

test("parseModulePorts parses literal vector widths", () => {
  const src = `module alu(input clk, input rst_n, input [7:0] a, b, output [7:0] y); endmodule`;
  const ports = parseModulePorts(src, "alu");
  assert.equal(ports.length, 5);
  assert.deepEqual(ports[2], { name: "a", direction: "input", width: 8 });
  assert.deepEqual(ports[3], { name: "b", direction: "input", width: 8 });
  assert.deepEqual(ports[4], { name: "y", direction: "output", width: 8 });
});

test("generateTestbench emits clock/reset harness and DUT instance", () => {
  const ports = parseModulePorts(
    `module alu(input clk, input rst_n, input [7:0] a, output [7:0] y); endmodule`,
    "alu"
  );
  const gen = generateTestbench("alu", ports, 10);
  assert.equal(gen.clockPort, "clk");
  assert.equal(gen.resetPort, "rst_n");
  assert.equal(gen.resetActiveLow, true);
  assert.match(gen.testbench, /always #5 clk = ~clk/);
  assert.match(gen.testbench, /rst_n = 0;/);
  assert.match(gen.testbench, /\.y\(y\)/);
  assert.match(gen.testbench, /\$dumpfile\("alu_tb\.vcd"\)/);
  assert.match(gen.testbench, /TODO/);
});
