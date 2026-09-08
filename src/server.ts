import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ToolRunner } from "./runner.js";
import { runLint } from "./tools/lint.js";
import { runCompile } from "./tools/compile.js";
import { runSimulate } from "./tools/simulate.js";
import { runWaveSummary } from "./tools/wave.js";
import { runCoverage } from "./tools/coverage.js";
import { runGenerateTestbench } from "./tools/generate_tb.js";
import { getToolchainInfo } from "./tools/toolchain.js";

export function createServer(runner: ToolRunner = new ToolRunner()): Server {
  const server = new Server(
    {
      name: "mcp-verilog",
      version: "0.2.1",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const tools: Tool[] = [
    {
      name: "verilog_lint",
      description:
        "Lints Verilog / SystemVerilog source files using verible-verilog-lint and returns structured line, column, severity, and rule diagnostics.",
      inputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description: "List of Verilog/SystemVerilog source files to lint (relative to cwd or absolute).",
          },
          ruleset: {
            type: "string",
            description: "Optional Verible ruleset name (e.g. 'all', 'default').",
          },
          cwd: {
            type: "string",
            description: "Optional working directory where the files reside.",
          },
        },
        required: ["files"],
      },
    },
    {
      name: "verilog_compile",
      description:
        "Performs syntax validation and elaboration checking on Verilog files using iverilog or verilator without running full simulation.",
      inputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description: "List of Verilog source files to compile.",
          },
          top_module: {
            type: "string",
            description: "Top-level module name for elaboration.",
          },
          compiler: {
            type: "string",
            enum: ["iverilog", "verilator"],
            description: "Compiler engine to use ('iverilog' or 'verilator'). Defaults to 'iverilog'.",
          },
          cwd: {
            type: "string",
            description: "Optional working directory.",
          },
        },
        required: ["files"],
      },
    },
    {
      name: "verilog_simulate",
      description:
        "Compiles and runs a behavioral testbench simulation using iverilog + vvp. Captures runtime assertions ($fatal), testbench errors, and protects against infinite loops with a timeout.",
      inputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description: "List of Verilog source files including the design and testbench.",
          },
          top_module: {
            type: "string",
            description: "Name of the top-level testbench module.",
          },
          timeout_ms: {
            type: "number",
            description: "Maximum simulation runtime in milliseconds before aborting (default: 15000).",
          },
          dump_waves: {
            type: "boolean",
            description: "Whether to record VCD waveforms.",
          },
          cwd: {
            type: "string",
            description: "Optional working directory.",
          },
        },
        required: ["files"],
      },
    },
    {
      name: "verilog_wave_summary",
      description:
        "Summarizes a VCD waveform file (from iverilog $dumpfile/$dumpvars runs) as token-capped per-signal toggle counts, time range, and timescale. No GUI needed.",
      inputSchema: {
        type: "object",
        properties: {
          vcd_file: {
            type: "string",
            description: "Path to the VCD file to summarize (relative to cwd or absolute).",
          },
          max_signals: {
            type: "number",
            description: "Maximum signals to return, most-active first (default: 30).",
          },
          cwd: {
            type: "string",
            description: "Optional working directory.",
          },
        },
        required: ["vcd_file"],
      },
    },
    {
      name: "verilog_coverage",
      description:
        "Measures Verilog line coverage by building the testbench with Verilator --coverage and running it, then reporting per-file covered/total lines and uncovered line numbers. Testbench must $finish.",
      inputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description: "List of Verilog source files including the design and testbench.",
          },
          top_module: {
            type: "string",
            description: "Name of the top-level testbench module (must terminate with $finish).",
          },
          timeout_ms: {
            type: "number",
            description: "Maximum build+run time in milliseconds (default: 180000).",
          },
          cwd: {
            type: "string",
            description: "Optional working directory.",
          },
        },
        required: ["files", "top_module"],
      },
    },
    {
      name: "verilog_generate_tb",
      description:
        "Generates a testbench skeleton (clock/reset harness, DUT instantiation, VCD dump, PASS/$finish) from a Verilog module's port list, with a TODO for design-specific assertions.",
      inputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description: "Verilog source files; the file containing top_module is parsed for ports.",
          },
          top_module: {
            type: "string",
            description: "Name of the design module to generate a testbench for.",
          },
          cycles: {
            type: "number",
            description: "Simulation run length in clock periods before $finish (default: 20).",
          },
          output_file: {
            type: "string",
            description: "Optional path to write the generated testbench to.",
          },
          cwd: {
            type: "string",
            description: "Optional working directory.",
          },
        },
        required: ["files", "top_module"],
      },
    },
    {
      name: "verilog_toolchain_info",
      description:
        "Returns active container or host execution runtime info and versions of iverilog, verilator, verible, and sv2v.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case "verilog_lint": {
          const files = (args.files as string[]) || [];
          const ruleset = args.ruleset as string | undefined;
          const cwd = args.cwd as string | undefined;
          const result = await runLint(runner, files, ruleset, cwd);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "verilog_compile": {
          const files = (args.files as string[]) || [];
          const topModule = args.top_module as string | undefined;
          const compiler = (args.compiler as "iverilog" | "verilator") || "iverilog";
          const cwd = args.cwd as string | undefined;
          const result = await runCompile(runner, files, topModule, compiler, cwd);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "verilog_simulate": {
          const files = (args.files as string[]) || [];
          const topModule = args.top_module as string | undefined;
          const timeoutMs = typeof args.timeout_ms === "number" ? args.timeout_ms : 15000;
          const dumpWaves = Boolean(args.dump_waves);
          const cwd = args.cwd as string | undefined;
          const result = await runSimulate(runner, files, topModule, timeoutMs, dumpWaves, cwd);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "verilog_wave_summary": {
          const vcdFile = (args.vcd_file as string) || "";
          const maxSignals = typeof args.max_signals === "number" ? args.max_signals : 30;
          const cwd = args.cwd as string | undefined;
          const result = await runWaveSummary(vcdFile, maxSignals, cwd);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "verilog_coverage": {
          const files = (args.files as string[]) || [];
          const topModule = (args.top_module as string) || "";
          const timeoutMs = typeof args.timeout_ms === "number" ? args.timeout_ms : 180000;
          const cwd = args.cwd as string | undefined;
          const result = await runCoverage(runner, files, topModule, cwd, timeoutMs);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "verilog_generate_tb": {
          const files = (args.files as string[]) || [];
          const topModule = (args.top_module as string) || "";
          const cycles = typeof args.cycles === "number" ? args.cycles : 20;
          const outputFile = args.output_file as string | undefined;
          const cwd = args.cwd as string | undefined;
          const result = await runGenerateTestbench(files, topModule, cycles, outputFile, cwd);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "verilog_toolchain_info": {
          const result = await getToolchainInfo(runner);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: `Error: Unknown tool "${name}".`,
              },
            ],
            isError: true,
          };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: `Tool execution failed: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
