import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

test("MCP server registers required Verilog tools", async () => {
  const server = createServer();

  // Retrieve list of tools directly through internal handler
  const handler = (server as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
  assert.ok(handler, "ListTools handler must be registered");

  const response = await handler({ method: "tools/list" });
  assert.ok(response.tools, "Tools list must be returned");

  const toolNames = response.tools.map((t: any) => t.name);
  assert.ok(toolNames.includes("verilog_lint"), "verilog_lint must be present");
  assert.ok(toolNames.includes("verilog_compile"), "verilog_compile must be present");
  assert.ok(toolNames.includes("verilog_simulate"), "verilog_simulate must be present");
  assert.ok(toolNames.includes("verilog_toolchain_info"), "verilog_toolchain_info must be present");

  // Validate input schemas
  for (const tool of response.tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.description && tool.description.length > 10);
  }
});
