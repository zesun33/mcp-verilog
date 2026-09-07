export interface CoverageLine {
  line: number;
  hits: number;
}

export interface CoverageFileStat {
  file: string;
  linesTotal: number;
  linesCovered: number;
  uncoveredLines: number[];
}

/**
 * Parses `verilator_coverage --write-info` output (lcov-ish format):
 *   SF:<file>
 *   DA:<line>,<hits>
 *   end_of_record
 */
export function parseCoverageInfo(
  rawInfo: string,
  maxUncoveredPerFile: number = 20
): CoverageFileStat[] {
  const files: CoverageFileStat[] = [];
  let current: { file: string; lines: CoverageLine[] } | null = null;

  const flush = () => {
    if (!current) return;
    const uncovered = current.lines
      .filter((l) => l.hits === 0)
      .map((l) => l.line)
      .slice(0, Math.max(1, maxUncoveredPerFile));
    files.push({
      file: current.file,
      linesTotal: current.lines.length,
      linesCovered: current.lines.filter((l) => l.hits > 0).length,
      uncoveredLines: uncovered,
    });
    current = null;
  };

  for (const rawLine of rawInfo.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("SF:")) {
      flush();
      current = { file: line.slice(3), lines: [] };
    } else if (line.startsWith("DA:") && current) {
      const m = line.match(/^DA:(\d+),(\d+)/);
      if (m) {
        current.lines.push({
          line: parseInt(m[1], 10),
          hits: parseInt(m[2], 10),
        });
      }
    } else if (line === "end_of_record") {
      flush();
    }
  }
  flush();

  return files;
}
