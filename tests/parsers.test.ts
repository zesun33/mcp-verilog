import test from "node:test";
import assert from "node:assert/strict";
import { parseVeribleOutput } from "../src/parsers/verible.js";
import { parseIverilogOutput, extractSimulationErrors } from "../src/parsers/iverilog.js";
import { parseVerilatorOutput } from "../src/parsers/verilator.js";

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
