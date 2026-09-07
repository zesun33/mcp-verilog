export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  file: string;
  line: number;
  column?: number;
  severity: DiagnosticSeverity;
  message: string;
  rule?: string;
}

export interface LintResult {
  success: boolean;
  tool: string;
  diagnostics: Diagnostic[];
  rawOutput: string;
}

export interface CompileResult {
  success: boolean;
  compiler: "iverilog" | "verilator";
  diagnostics: Diagnostic[];
  rawOutput: string;
}

export interface SimulationResult {
  success: boolean;
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  vcdPath?: string;
  errors: string[];
}

export interface WaveSignalSummary {
  name: string;
  width: number;
  transitions: number;
  toggled: boolean;
}

export interface WaveSummaryResult {
  success: boolean;
  vcdFile: string;
  timescale: string;
  timeStart: number;
  timeEnd: number;
  signalCount: number;
  signals: WaveSignalSummary[];
  truncated: boolean;
  errors: string[];
}

export interface CoverageResult {
  success: boolean;
  topModule: string;
  linesTotal: number;
  linesCovered: number;
  coveragePct: number;
  files: import("./coverage.js").CoverageFileStat[];
  simErrors: string[];
  errors: string[];
}

export interface ToolchainVersion {
  name: string;
  version: string;
  available: boolean;
  path?: string;
}

export interface ToolchainInfo {
  runtime: "podman" | "docker" | "host";
  image?: string;
  tools: ToolchainVersion[];
}
