import { WaveSignalSummary } from "./types.js";

export interface ParsedWave {
  timescale: string;
  timeStart: number;
  timeEnd: number;
  signals: WaveSignalSummary[];
}

/**
 * Parses VCD waveform text (`$var` declarations + `#time` value changes).
 * Returns a token-capped per-signal toggle summary (no raw dump).
 * Supports scalar (`0|1|x|z<id>`) and vector (`b<bits> <id>`, `r<real> <id>`) changes.
 */
export function parseVcdSummary(
  rawVcd: string,
  maxSignals: number = 30
): ParsedWave {
  const signalsById = new Map<string, { name: string; width: number }>();
  const transitions = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  let timescale = "unknown";
  let timeStart = 0;
  let timeEnd = 0;
  let seenTime = false;
  let currentTime = 0;

  const scopeStack: string[] = [];
  const lines = rawVcd.split("\n");
  let inTimescale = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("$timescale")) {
      // iverilog emits single-line `$timescale 1ns $end`, but the spec
      // allows the value on following lines before `$end`.
      const m = line.match(/\$timescale\s+(.+?)\s*\$end/);
      if (m) {
        timescale = m[1].trim();
      } else {
        const rest = line.slice("$timescale".length).trim();
        if (rest && rest !== "$end") timescale = rest;
        else inTimescale = true;
      }
      continue;
    }

    if (inTimescale) {
      if (line === "$end" || line.endsWith("$end")) {
        const val = line.slice(0, line.indexOf("$end")).trim();
        if (val) timescale = val;
        inTimescale = false;
      } else {
        timescale = line;
      }
      continue;
    }

    if (line.startsWith("$scope")) {
      const m = line.match(/\$scope\s+\S+\s+(\S+)/);
      if (m) scopeStack.push(m[1]);
      continue;
    }

    if (line.startsWith("$upscope")) {
      scopeStack.pop();
      continue;
    }

    if (line.startsWith("$var")) {
      // $var <type> <width> <id> <reference> [$end]
      const m = line.match(/\$var\s+\S+\s+(\d+)\s+(\S)\s+(\S+)/);
      if (m) {
        const width = parseInt(m[1], 10);
        const id = m[2];
        const ref = m[3];
        const name = [...scopeStack, ref].join(".");
        if (!signalsById.has(id)) {
          signalsById.set(id, { name, width });
          transitions.set(id, 0);
        }
      }
      continue;
    }

    if (line.startsWith("#")) {
      const t = parseInt(line.slice(1), 10);
      if (!Number.isNaN(t)) {
        currentTime = t;
        if (!seenTime) {
          timeStart = t;
          seenTime = true;
        }
        timeEnd = t;
      }
      continue;
    }

    if (line.startsWith("$")) continue;

    // Value changes: scalar `0!`, vector `b1010 !`, real `r1.5 !`
    let id: string | undefined;
    const scalar = line.match(/^[01xXzZ](.+)$/);
    if (scalar) {
      id = scalar[1].trim().split(/\s+/)[0];
    } else {
      const vec = line.match(/^[bBrR]\S+\s+(\S+)/);
      if (vec) id = vec[1];
    }

    if (id && signalsById.has(id)) {
      transitions.set(id, (transitions.get(id) ?? 0) + 1);
      if (!firstSeen.has(id)) firstSeen.set(id, currentTime);
      lastSeen.set(id, currentTime);
    }
  }

  const signals: WaveSignalSummary[] = [...signalsById.entries()].map(
    ([id, meta]) => ({
      name: meta.name,
      width: meta.width,
      transitions: transitions.get(id) ?? 0,
      toggled: (transitions.get(id) ?? 0) > 0,
    })
  );

  // Most-active signals first so truncation keeps signal.
  signals.sort((a, b) => b.transitions - a.transitions);

  return {
    timescale,
    timeStart,
    timeEnd,
    signals: signals.slice(0, Math.max(1, maxSignals)),
  };
}
