export type Priority = "low" | "medium" | "high";
export type TargetLabel = "actual" | "tolerable" | "goal" | "wish";
export type Effort = "small" | "medium" | "large" | "unknown";
export type StrategyStatus = "draft" | "active" | "done" | "paused";
export type Confidence = "low" | "medium" | "high" | "unknown";
export type EvidenceSourceType = "note" | "url" | "gitlab" | "document" | "meeting" | "other";
export type LinkedEntityType = "value" | "measure" | "target" | "strategyGroup" | "strategy" | "expectedImpact";
export type EntityType = "values" | "measures" | "targets" | "strategyGroups" | "strategies" | "expectedImpacts" | "evidence" | "actualMovements";

export interface WorkspaceMetadata {
  id: string;
  name: string;
  description: string;
  cycle: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitLabSettings {
  baseUrl: string;
  projectPath: string;
  branch: string;
  filePath: string;
}

export interface ValueItem {
  id: string;
  title: string;
  ambition?: string;
  description?: string;
  stakeholder?: string;
  priority?: Priority;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MeasureItem {
  id: string;
  valueId?: string;
  title: string;
  description?: string;
  unit?: string;
  meter?: string;
  dataSource?: string;
  now?: string;
  target?: string;
  wish?: string;
  tolerable?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TargetItem {
  id: string;
  measureId: string;
  label: TargetLabel;
  value: string;
  date?: string;
  rationale?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyGroupItem {
  id: string;
  title: string;
  description?: string;
  owner?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyItem {
  id: string;
  groupId?: string;
  title: string;
  description?: string;
  owner?: string;
  effort?: Effort;
  status?: StrategyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ExpectedImpactItem {
  id: string;
  strategyId: string;
  measureId: string;
  score: number;
  confidence?: Confidence;
  rationale?: string;
  evidenceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
  description?: string;
  linkedEntityType?: LinkedEntityType;
  linkedEntityId?: string;
  sourceType?: EvidenceSourceType;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActualMovementItem {
  id: string;
  valueId?: string;
  measureId?: string;
  targetId?: string;
  observedValue?: string;
  observationDate?: string;
  comment?: string;
  evidenceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommitLabWorkspace {
  schemaVersion: "1.0.0";
  workspace: WorkspaceMetadata;
  values: ValueItem[];
  measures: MeasureItem[];
  targets: TargetItem[];
  strategyGroups: StrategyGroupItem[];
  strategies: StrategyItem[];
  expectedImpacts: ExpectedImpactItem[];
  evidence: EvidenceItem[];
  actualMovements: ActualMovementItem[];
  settings: {
    gitlab: GitLabSettings;
  };
}
