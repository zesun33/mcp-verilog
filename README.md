# @zesun33/mcp-verilog

> Model Context Protocol (MCP) server for Verilog and SystemVerilog hardware development.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Protocol: MCP](https://img.shields.io/badge/protocol-MCP_stdio-blueviolet)](https://modelcontextprotocol.io)
[![Runtime: Rootless Podman](https://img.shields.io/badge/runtime-rootless_podman-brightgreen)](#execution-runtime)

`mcp-verilog` provides structured, token-efficient tool APIs so AI coding agents (Claude Code, Cursor, Antigravity, OpenCode) can lint, syntax-check, and simulate Verilog designs in closed-loop workflows without blowing context windows on unstructured compiler output.

---

## Tools Exposed

| Tool | Parameters | Engine | Description |
| :--- | :--- | :--- | :--- |
| `verilog_lint` | `files: string[]`, `ruleset?: string`, `cwd?: string` | `verible-verilog-lint` | Analyzes code style and syntax, returning structured line, column, severity, and rule diagnostics. |
| `verilog_compile` | `files: string[]`, `top_module?: string`, `compiler?: "iverilog" \| "verilator"`, `cwd?: string` | `iverilog` / `verilator` | Elaboration and syntax checking without running a full simulation. |
| `verilog_simulate` | `files: string[]`, `top_module?: string`, `timeout_ms?: number`, `dump_waves?: boolean`, `cwd?: string` | `iverilog` + `vvp` | Compiles and executes a behavioral testbench, capturing runtime `$fatal` assertions, errors, and timing out runaway loops. |
| `verilog_toolchain_info` | *none* | Probe | Returns the active runtime (`podman`, `docker`, `host`) and installed toolchain versions. |

---

## Execution Runtime

`mcp-verilog` automatically prioritizes running tools inside the [`zesun33/verilog`](https://github.com/zesun33/eda-docker-images) rootless Podman image (`localhost/zesun33/verilog`), ensuring tools run identically across any Linux host without polluting the host environment:
- Container mount: `-v <workspace>:/workspace:Z -w /workspace`
- Podman storage option: `--storage-opt overlay.ignore_chown_errors=true`

To force host binaries instead of container execution:
```bash
export MCP_VERILOG_RUNTIME=host
```

---

## Client Setup

### 1. Cursor / Antigravity IDE
Add to your project's `.cursor/mcp.json` or global configuration:
```json
{
  "mcpServers": {
    "verilog": {
      "command": "node",
      "args": ["/data/mxm6982/projects/personal-projects/mcp-verilog/dist/index.js"]
    }
  }
}
```

### 2. Claude Desktop
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

Run the full verification suite:
```bash
./scripts/verify.sh
```

Run specific test tiers:
```bash
npm run test:unit       # Unit tests (regex parsers & contract)
npm test                # All tests (including Podman integration)
```
