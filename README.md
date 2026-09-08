# @zesun33/mcp-verilog

> Model Context Protocol (MCP) server for Verilog and SystemVerilog hardware development.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://github.com/zesun33/mcp-verilog/actions/workflows/ci.yml/badge.svg)](https://github.com/zesun33/mcp-verilog/actions/workflows/ci.yml)
[![Protocol: MCP](https://img.shields.io/badge/protocol-MCP_stdio-blueviolet)](https://modelcontextprotocol.io)
[![Runtime: Rootless Podman](https://img.shields.io/badge/runtime-rootless_podman-brightgreen)](#execution-runtime)

`mcp-verilog` provides structured, token-efficient tool APIs so AI coding agents and IDEs (**Cursor**, **Windsurf**, **GitHub Copilot / OpenAI Codex**, **Claude Code**, **Google Antigravity**, **OpenCode**, **Cline**) can lint, syntax-check, and simulate Verilog designs in closed-loop workflows without blowing context windows on unstructured compiler output.

---

## ⚡ Quick Tour: See It in Action

### Why AI Agents Need `mcp-verilog`
| Without `mcp-verilog` (Raw Shell) | With `mcp-verilog` (Structured MCP) |
| :--- | :--- |
| Dumps 5,000 lines of raw compiler output into context | Returns **`< 100 tokens`** of clean JSON |
| Agent hallucinates line numbers and syntax bugs | Direct file/line jump: `"line": 9, "severity": "error"` |
| Broken `while(1)` simulation hangs the agent/IDE | **Timeout kill-switch** (`timedOut: true`) |
| Requires manual host install of 5+ C++ EDA packages | **Zero host install** (isolated rootless Podman) |

### Real Agent Scenarios in 60 Seconds

#### 1. Probing the Toolchain (Zero-Config Verification)
```json
// Tool Call: verilog_toolchain_info
{
  "runtime": "podman",
  "tools": [
    { "name": "iverilog", "available": true, "version": "Icarus Verilog version 12.0 (stable)" },
    { "name": "verilator", "available": true, "version": "Verilator 5.020" },
    { "name": "verible-verilog-lint", "available": true, "version": "v0.0-4080-ga0a8d8eb" },
    { "name": "sv2v", "available": true, "version": "v0.0.13" }
  ]
}
```

#### 2. Pinpoint Syntax Diagnostics (1-Shot Repair)
```json
// Tool Call: verilog_lint {"files": ["syntax_error.v"]}
{
  "success": false,
  "diagnostics": [
    { "file": "syntax_error.v", "line": 9, "severity": "error", "message": "syntax error at token 'end'" }
  ]
}
```

#### 3. Closed-Loop Testbench Simulation (318ms)
```json
// Tool Call: verilog_simulate {"files": ["counter.v", "counter_tb.v"], "top_module": "counter_tb"}
{
  "success": true,
  "exitCode": 0,
  "stdout": "PASS: Counter testbench completed successfully with count=5\n"
}
```

#### 4. Instant Assertion Triage (Catches Failures Safely)
```json
// Tool Call: verilog_simulate {"files": ["failing_tb.v"], "top_module": "failing_tb"}
{
  "success": false,
  "exitCode": 1,
  "errors": ["FATAL: failing_tb.v:11: SIMULATION_ASSERTION_FAILED: Test intentional failure."]
}
```

#### 5. Waveform Summary Without a GUI (Token-Capped Toggles)
```json
// Tool Call: verilog_wave_summary {"vcd_file": "waves.vcd"}
{
  "success": true,
  "timescale": "1ps",
  "signalCount": 12,
  "signals": [
    { "name": "wave_demo_tb.clk", "width": 1, "transitions": 28, "toggled": true }
  ]
}
```

#### 6. Line Coverage via Verilator (Honest Uncovered Lines)
```json
// Tool Call: verilog_coverage {"files": ["counter.v", "wave_demo_tb.v"], "top_module": "wave_demo_tb"}
{
  "success": true,
  "linesTotal": 24,
  "linesCovered": 21,
  "coveragePct": 87.5
}
```

#### 7. Testbench Skeleton in One Call (1-Shot Harness)
```json
// Tool Call: verilog_generate_tb {"files": ["counter.v"], "top_module": "counter"}
{
  "success": true,
  "testbenchModule": "counter_tb",
  "clockPort": "clk",
  "resetPort": "rst"
}
```

---

## Tools Exposed

| Tool | Parameters | Engine | Description |
| :--- | :--- | :--- | :--- |
| `verilog_lint` | `files: string[]`, `ruleset?: string`, `cwd?: string` | `verible-verilog-lint` | Analyzes code style and syntax, returning structured line, column, severity, and rule diagnostics. |
| `verilog_compile` | `files: string[]`, `top_module?: string`, `compiler?: "iverilog" \| "verilator"`, `cwd?: string` | `iverilog` / `verilator` | Elaboration and syntax checking without running a full simulation. |
| `verilog_simulate` | `files: string[]`, `top_module?: string`, `timeout_ms?: number`, `dump_waves?: boolean`, `cwd?: string` | `iverilog` + `vvp` | Compiles and executes a behavioral testbench, capturing runtime `$fatal` assertions, errors, and timing out runaway loops. |
| `verilog_wave_summary` | `vcd_file: string`, `max_signals?: number`, `cwd?: string` | VCD parser | Summarizes a VCD file as per-signal toggle counts, time range, and timescale (no GUI needed). |
| `verilog_coverage` | `files: string[]`, `top_module: string`, `timeout_ms?: number`, `cwd?: string` | `verilator --coverage` + `verilator_coverage` | Builds the `$finish`-terminated testbench with Verilator coverage and reports per-file covered/total lines plus uncovered line numbers. |
| `verilog_generate_tb` | `files: string[]`, `top_module: string`, `cycles?: number`, `output_file?: string`, `cwd?: string` | Port parser | Generates a clock/reset harness testbench skeleton with DUT instantiation, VCD dump, and a TODO for assertions. |
| `verilog_toolchain_info` | *none* | Probe | Returns the active runtime (`podman`, `docker`, `host`) and installed toolchain versions. |

---

## Execution Runtime

`mcp-verilog` runs inside the [`zesun33/verilog`](https://github.com/zesun33/eda-docker-images) rootless Podman image so tools are identical on any Linux host.

**Public install (recommended — anyone can pull):**
```bash
podman pull ghcr.io/zesun33/verilog:latest
export MCP_VERILOG_IMAGE=ghcr.io/zesun33/verilog
```

`ghcr.io/zesun33/verilog` is the default (anyone can pull). Local builds still work as `localhost/zesun33/verilog` via `MCP_VERILOG_IMAGE`.

- Container mount: `-v <workspace>:/workspace:Z -w /workspace`
- Podman storage option: `--storage-opt overlay.ignore_chown_errors=true`

To force host binaries instead of container execution:
```bash
export MCP_VERILOG_RUNTIME=host
```


---

## Universal Client & AI IDE Setup

Because `mcp-verilog` implements the standard [Model Context Protocol (MCP)](https://modelcontextprotocol.io), it connects seamlessly to any MCP-compliant AI IDE or agent interface:

| Environment | Supported Tools | Setup Location |
| :--- | :--- | :--- |
| **AI IDEs** | Cursor, Windsurf, Google Antigravity, Zed | `.cursor/mcp.json` or `.windsurf/mcp.json` |
| **Extensions** | GitHub Copilot / OpenAI Codex, Cline, Roo Code | VS Code MCP extension settings |
| **CLI Agents** | Claude Code, OpenCode, Goose, Antigravity CLI (`agy`) | Global MCP configuration or CLI flags |
| **Desktop** | Claude Desktop | `claude_desktop_config.json` |

### 1. Cursor / Windsurf / Antigravity IDE
Add to your project's `.cursor/mcp.json` or `.windsurf/mcp.json`:
```json
{
  "mcpServers": {
    "verilog": {
      "command": "node",
      "args": ["/path/to/personal-projects/mcp-verilog/dist/index.js"]
    }
  }
}
```

### 2. VS Code (GitHub Copilot / OpenAI Codex / Cline)
Add to your VS Code MCP settings or user settings:
```json
{
  "mcpServers": {
    "verilog": {
      "command": "node",
      "args": ["/path/to/personal-projects/mcp-verilog/dist/index.js"]
    }
  }
}
```

### 3. Claude Desktop & Claude Code
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "verilog": {
      "command": "node",
      "args": ["/path/to/personal-projects/mcp-verilog/dist/index.js"]
    }
  }
}
```

---

## Verification & Testing

Run the full 6-gate verification suite:
```bash
# Full verification (with Podman container execution)
./scripts/verify.sh

# Fast / CI verification (headless environments)
./scripts/verify.sh --quick
```

Run specific test tiers:
```bash
npm run test:unit       # Unit tests (regex parsers & contract)
npm test                # All tests (including Podman integration)
```
