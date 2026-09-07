import * as fs from "node:fs";
import * as path from "node:path";
import { parseVcdSummary } from "../parsers/vcd.js";
import { WaveSummaryResult } from "../parsers/types.js";

export async function runWaveSummary(
  vcdFile: string,
  maxSignals: number = 30,
  cwd?: string
): Promise<WaveSummaryResult> {
  const base = path.resolve(cwd || process.cwd());
  const abs = path.isAbsolute(vcdFile) ? vcdFile : path.join(base, vcdFile);

  if (!vcdFile) {
    return {
      success: false,
      vcdFile,
      timescale: "unknown",
      timeStart: 0,
      timeEnd: 0,
      signalCount: 0,
      signals: [],
      truncated: false,
      errors: ["No VCD file specified."],
    };
  }

  let raw: string;
  try {
    raw = await fs.promises.readFile(abs, "utf-8");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      vcdFile,
      timescale: "unknown",
      timeStart: 0,
      timeEnd: 0,
      signalCount: 0,
      signals: [],
      truncated: false,
      errors: [`Cannot read VCD file: ${message}`],
    };
  }

  if (!raw.includes("$var") && !raw.includes("$enddefinitions")) {
    return {
      success: false,
      vcdFile,
      timescale: "unknown",
      timeStart: 0,
      timeEnd: 0,
      signalCount: 0,
      signals: [],
      truncated: false,
      errors: ["File does not look like VCD (missing $var/$enddefinitions)."],
    };
  }

  const parsed = parseVcdSummary(raw, maxSignals);
  const totalSignals = countVcdSignals(raw);

  return {
    success: true,
    vcdFile,
    timescale: parsed.timescale,
    timeStart: parsed.timeStart,
    timeEnd: parsed.timeEnd,
    signalCount: totalSignals,
    signals: parsed.signals,
    truncated: totalSignals > parsed.signals.length,
    errors: [],
  };
}

function countVcdSignals(rawVcd: string): number {
  let count = 0;
  for (const line of rawVcd.split("\n")) {
    if (line.trim().startsWith("$var ")) count += 1;
  }
  return count;
}
