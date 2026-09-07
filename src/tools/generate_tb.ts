import * as fs from "node:fs";
import * as path from "node:path";

export interface TbPort {
  name: string;
  direction: "input" | "output" | "inout";
  width: number;
}

export interface TbGenerateResult {  success: boolean;
  topModule: string;
  testbenchModule: string;
  ports: TbPort[];
  clockPort?: string;
  resetPort?: string;
  resetActiveLow?: boolean;
  testbench: string;
  parsedFrom?: string;
  outputFile?: string;
  errors: string[];
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function widthOf(range: string | undefined): number {
  if (!range) return 1;
  const m = range.replace(/\s+/g, "").match(/\[(\d+):(\d+)\]/);
  if (!m) return 1;
  return Math.abs(parseInt(m[1], 10) - parseInt(m[2], 10)) + 1;
}

/**
 * Parses ANSI module ports from Verilog/SystemVerilog source.
 * Handles `input clk, input rst_n, input [7:0] data` in the header.
 * Falls back to bare identifier lists for non-ANSI headers.
 */
export function parseModulePorts(source: string, topModule: string): TbPort[] {
  const clean = stripComments(source);
  const modRe = new RegExp(
    `module\\s+${topModule}\\s*(?:#\\s*\\([^;]*?\\))?\\s*\\(([\\s\\S]*?)\\)\\s*;`
  );
  const m = clean.match(modRe);
  if (!m) return [];

  const ports: TbPort[] = [];
  let lastDir: "input" | "output" | "inout" = "input";
  let lastRange: string | undefined;

  for (const raw of splitTopLevel(m[1])) {
    const part = raw.trim();
    if (!part) continue;
    // Strip net-type / qualifier keywords (`wire`, `reg`, `logic`, `signed`).
    const scrub = (s: string): string => {
      let out = s;
      for (;;) {
        const next = out.replace(/^(wire|reg|logic|tri|triand|trior|wand|wor|supply0|supply1|signed|unsigned)\b\s*/g, "").trim();
        if (next === out) return out;
        out = next;
      }
    };
    const dm = part.match(/^(input|output|inout)\b\s*(.*)$/s);
    if (dm) {
      lastDir = dm[1] as "input" | "output" | "inout";
      // Remainder may be `[range]`, `wire/reg/logic`, or both in either order.
      const rest = scrub(dm[2]);
      const rm = rest.match(/^(\[[^\]]+\])?\s*(.*)$/s);
      lastRange = rm?.[1];
      const names = scrub(rm?.[2] ?? "").split(",").map((n) => n.trim()).filter(Boolean);
      for (const n of names) {
        const id = scrub(n).match(/^([A-Za-z_][A-Za-z0-9_$]*)/);
        if (id) ports.push({ name: id[1], direction: lastDir, width: widthOf(lastRange) });
      }
    } else {
      // Continuation of previous direction (`input clk, rst_n`) or bare list.
      const rest = scrub(part);
      const rangeM = rest.match(/^(\[[^\]]+\])?\s*(.*)$/s);
      const range = rangeM?.[1] ?? lastRange;
      const names = scrub(rangeM?.[2] ?? rest).split(",").map((n) => n.trim()).filter(Boolean);
      for (const n of names) {
        const id = scrub(n).match(/^([A-Za-z_][A-Za-z0-9_$]*)/);
        if (id) ports.push({ name: id[1], direction: lastDir, width: widthOf(range) });
      }
    }
  }

  return ports;
}

function detectClock(ports: TbPort[]): string | undefined {
  return ports.find((p) => p.direction === "input" && /^(clk|clock|clk_i)$/i.test(p.name))?.name;
}

function detectReset(ports: TbPort[]): { name?: string; activeLow?: boolean } {
  const rst = ports.find((p) => p.direction === "input" && /^(rst|reset|rst_n|reset_n|rst_ni|areset.*)$/i.test(p.name));
  if (!rst) return {};
  return { name: rst.name, activeLow: /(_n|_ni|_low)$/i.test(rst.name) };
}

function decl(port: TbPort, tbType: "reg" | "wire"): string {
  const vec = port.width > 1 ? ` [${port.width - 1}:0]` : "";
  return `    ${tbType}${vec} ${port.name};`;
}

/**
 * Generates a self-checking-skeleton testbench: clock/reset harness,
 * DUT instantiation, VCD dump, run cycles, PASS + $finish, and a TODO
 * placeholder for design-specific assertions.
 */
export function generateTestbench(
  topModule: string,
  ports: TbPort[],
  cycles: number = 20
): { testbench: string; clockPort?: string; resetPort?: string; resetActiveLow?: boolean } {
  const tbModule = `${topModule}_tb`;
  const clockPort = detectClock(ports);
  const { name: resetPort, activeLow: resetActiveLow } = detectReset(ports);

  const decls = ports.map((p) =>
    decl(p, p.direction === "input" ? "reg" : "wire")
  );

  const conn = ports.map((p) => `        .${p.name}(${p.name})`);

  const clkGen = clockPort
    ? `\n    always #5 ${clockPort} = ~${clockPort};\n`
    : "";
  const resetSeq = resetPort
    ? resetActiveLow
      ? `        ${resetPort} = 0;\n        #20;\n        ${resetPort} = 1;\n`
      : `        ${resetPort} = 1;\n        #20;\n        ${resetPort} = 0;\n`
    : "";
  const clkInit = clockPort ? `        ${clockPort} = 0;\n` : "";
  const inputInit = ports
    .filter((p) => p.direction === "input" && p.name !== clockPort && p.name !== resetPort)
    .map((p) => `        ${p.name} = ${p.width > 1 ? `${p.width}'d0` : "0"};`)
    .join("\n");

  const testbench = `\`timescale 1ns/1ps

// Auto-generated by mcp-verilog verilog_generate_tb — add design-specific
// stimulus and replace the TODO below with real assertions.
module ${tbModule};
${decls.join("\n")}

    ${topModule} dut (
${conn.join(",\n")}
    );
${clkGen}
    initial begin
        $dumpfile("${tbModule}.vcd");
        $dumpvars(0, ${tbModule});
${clkInit}${resetSeq}${inputInit ? inputInit + "\n" : ""}
        #${cycles * 10};
        // TODO: check outputs against expected values, e.g.
        // if (count == 8'd0) $fatal(1, "FAIL: ...");
        $display("PASS: ${topModule} smoke test completed");
        $finish(0);
    end
endmodule
`;

  return { testbench, clockPort, resetPort, resetActiveLow };
}

export async function runGenerateTestbench(
  files: string[],
  topModule: string,
  cycles: number = 20,
  outputFile?: string,
  cwd?: string
): Promise<TbGenerateResult> {
  const base = path.resolve(cwd || process.cwd());

  if (files.length === 0 || !topModule) {
    return {
      success: false, topModule, testbenchModule: `${topModule}_tb`,
      ports: [], testbench: "", errors: ["files and top_module are required."],
    };
  }

  let source = "";
  let parsedFrom: string | undefined;
  for (const f of files) {
    try {
      const abs = path.isAbsolute(f) ? f : path.join(base, f);
      const text: string = await fs.promises.readFile(abs, "utf-8");
      if (new RegExp(`module\\s+${topModule}\\b`).test(text)) {
        source = text;
        parsedFrom = f;
        break;
      }
      if (!source) {
        source = text;
        parsedFrom = f;
      }
    } catch {
      // try next file
    }
  }

  if (!source) {
    return {
      success: false, topModule, testbenchModule: `${topModule}_tb`,
      ports: [], testbench: "", errors: ["Cannot read any source file."],
    };
  }

  const ports = parseModulePorts(source, topModule);
  if (ports.length === 0) {
    return {
      success: false, topModule, testbenchModule: `${topModule}_tb`,
      ports: [], testbench: "", parsedFrom,
      errors: [`No ports parsed for module "${topModule}".`],
    };
  }

  const gen = generateTestbench(topModule, ports, cycles);
  let written: string | undefined;
  if (outputFile) {
    const abs = path.isAbsolute(outputFile) ? outputFile : path.join(base, outputFile);
    await fs.promises.writeFile(abs, gen.testbench);
    written = outputFile;
  }

  return {
    success: true,
    topModule,
    testbenchModule: `${topModule}_tb`,
    ports,
    clockPort: gen.clockPort,
    resetPort: gen.resetPort,
    resetActiveLow: gen.resetActiveLow,
    testbench: gen.testbench,
    parsedFrom,
    outputFile: written,
    errors: [],
  };
}
