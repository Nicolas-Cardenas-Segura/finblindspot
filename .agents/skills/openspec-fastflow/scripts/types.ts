export type Tier = "cheap" | "balanced" | "strong";
export type Risk = "low" | "medium" | "high";
export type Status = "pending" | "running" | "done" | "blocked";

export interface Context {
  path: string;
  start: number;
  end: number;
}

export interface Task {
  id: string;
  title: string;
  instructions: string;
  dependsOn: string[];
  risk: Risk;
  tier: Tier;
  status: Status;
  attempts: number;
  estimatedTokens: number;
  chargedTokens: number;
  reads: Context[];
  writes: string[];
  checks: string[];
  acceptance: string[];
  reviewed: boolean;
  evidence: string[];
}

export interface Plan {
  version: 1;
  change: string;
  baseRevision: string;
  budget: {
    maxParallel: number;
    maxAttempts: number;
    maxTokens: number;
    overheadTokens: number;
    maxPacketChars: number;
    maxOutputTokens: number;
  };
  tasks: Task[];
}
