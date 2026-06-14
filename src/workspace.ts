import type {
  ActualMovementItem,
  CommitLabWorkspace,
  EntityType,
  EvidenceItem,
  ExpectedImpactItem,
  MeasureItem,
  StrategyGroupItem,
  StrategyItem,
  TargetItem,
  ValueItem
} from "./types";

const STORAGE_KEY = "commitlab.workspace.v1";

export const entityLabels: Record<EntityType, string> = {
  values: "Values",
  measures: "Measures",
  targets: "Targets",
  strategyGroups: "Strategy Groups",
  strategies: "Strategies",
  expectedImpacts: "Expected Impacts",
  evidence: "Evidence",
  actualMovements: "Actual Movement"
};

export const entityInstructions: Record<EntityType, string> = {
  values:
    "A Value is an outcome or quality you care about. Describe what becomes better, safer, faster, cheaper, clearer, or more reliable. Work belongs under Strategy.",
  measures:
    "A Measure explains how a Value can be observed. It should define what is counted, rated, measured, or checked. Draft measures are fine.",
  targets:
    "A Target defines the scale for a Measure. The main VDT uses Now, Target, Wish, and Tolerable on each measurement row.",
  strategyGroups:
    "A Strategy Group clusters distinct strategies under a coarse theme. Strategies in a group should still be separate alternatives or complementary approaches, not hidden sub-tasks.",
  strategies:
    "A Strategy is a distinct possible approach to move Values. It may belong to a coarse strategy group, but it should not overlap with the other strategies in that group.",
  expectedImpacts:
    "Expected Impact describes how strongly a Strategy is expected to influence a specific measurement row. Score it from 0 to 1 and support it with rationale or evidence.",
  evidence:
    "Evidence is anything that supports, challenges, or explains the model. It may be a note, link, document, metric snapshot, feedback, or decision.",
  actualMovements:
    "Actual Movement records what changed in reality. This is not task progress; it should describe observed movement of a Value or Measure."
};

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

export function createEmptyWorkspace(): CommitLabWorkspace {
  const now = nowIso();
  return {
    schemaVersion: "1.0.0",
    workspace: {
      id: "ws_001",
      name: "EPAM Cloud Business Group Value Planning",
      description: "Value-first planning model for defining Cloud Business Group outcomes, measures, targets, and strategies.",
      cycle: "2026-Q3",
      owner: "",
      createdAt: now,
      updatedAt: now
    },
    values: [],
    measures: [],
    targets: [],
    strategyGroups: [],
    strategies: [],
    expectedImpacts: [],
    evidence: [],
    actualMovements: [],
    settings: {
      gitlab: {
        baseUrl: "https://gitlab.com",
        projectPath: "",
        branch: "main",
        filePath: "commitlab.json"
      }
    }
  };
}

export function createDemoWorkspace(): CommitLabWorkspace {
  const workspace = createEmptyWorkspace();
  const now = nowIso();
  const values: ValueItem[] = [
    {
      id: "val_quality",
      title: "Improve quality of Cloud Business Group opportunity shaping",
      ambition: "Cloud opportunities are shaped around explicit business value, risk, and delivery feasibility before major investment decisions.",
      description: "EPAM teams should qualify and shape cloud opportunities around explicit business value, risk, and delivery feasibility.",
      stakeholder: "Cloud practice leadership, delivery leadership, client partners",
      priority: "high",
      tags: ["cloud-business-group", "opportunity-quality"],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "val_alignment",
      title: "Increase alignment between org priorities and client-facing strategies",
      ambition: "Client-facing strategies clearly trace to Cloud Business Group priorities and can be understood by business and management stakeholders.",
      description: "Strategies should clearly connect EPAM organizational priorities with the work proposed for clients.",
      stakeholder: "Practice leadership, industry leadership, account leadership",
      priority: "high",
      tags: ["alignment"],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "val_reuse",
      title: "Increase reuse of validated cloud solution patterns",
      ambition: "Teams reuse validated solution patterns and evidence instead of rebuilding the same reasoning for each initiative.",
      description: "Teams should reuse proven patterns, evidence, and decision models instead of rebuilding the same thinking for each initiative.",
      stakeholder: "Cloud practice, solution architecture, delivery teams",
      priority: "medium",
      tags: ["reuse", "patterns"],
      createdAt: now,
      updatedAt: now
    }
  ];
  const measures: MeasureItem[] = [
    {
      id: "mea_quality_review",
      valueId: "val_quality",
      title: "Qualified cloud opportunities with explicit value model",
      unit: "opportunities",
      meter: "Count of cloud opportunities reviewed with documented values, measures, targets, and strategy links per quarter.",
      dataSource: "CommitLab workspace reviews",
      now: "1",
      target: "5",
      wish: "8",
      tolerable: "3",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "mea_alignment",
      valueId: "val_alignment",
      title: "Leadership alignment rating",
      unit: "1-5 rating",
      meter: "Average alignment score from practice, industry, and account leadership after strategy review.",
      dataSource: "Review workshop feedback",
      now: "2.5",
      target: "4",
      wish: "4.5",
      tolerable: "3.5",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "mea_reuse",
      valueId: "val_reuse",
      title: "Reusable cloud patterns adopted by teams",
      unit: "patterns",
      meter: "Count of validated cloud patterns reused by more than one team or initiative per quarter.",
      dataSource: "Pattern library and workspace links",
      now: "1",
      target: "3",
      wish: "6",
      tolerable: "2",
      createdAt: now,
      updatedAt: now
    }
  ];
  const targets: TargetItem[] = [
    { id: "tar_quality_actual", measureId: "mea_quality_review", label: "actual", value: "1 qualified cloud opportunity currently modeled", createdAt: now, updatedAt: now },
    { id: "tar_quality_tolerable", measureId: "mea_quality_review", label: "tolerable", value: "3 qualified cloud opportunities with explicit value models per quarter", createdAt: now, updatedAt: now },
    { id: "tar_quality_goal", measureId: "mea_quality_review", label: "goal", value: "5 qualified cloud opportunities with explicit value models per quarter", createdAt: now, updatedAt: now },
    { id: "tar_quality_wish", measureId: "mea_quality_review", label: "wish", value: "8 qualified cloud opportunities with explicit value models per quarter", createdAt: now, updatedAt: now },
    { id: "tar_alignment_actual", measureId: "mea_alignment", label: "actual", value: "Average leadership alignment rating 2.5 out of 5", createdAt: now, updatedAt: now },
    { id: "tar_alignment_goal", measureId: "mea_alignment", label: "goal", value: "Average leadership alignment rating >= 4 out of 5", createdAt: now, updatedAt: now },
    { id: "tar_alignment_wish", measureId: "mea_alignment", label: "wish", value: "Average leadership alignment rating >= 4.5 out of 5", createdAt: now, updatedAt: now },
    { id: "tar_reuse_actual", measureId: "mea_reuse", label: "actual", value: "1 validated cloud pattern reused by more than one team", createdAt: now, updatedAt: now },
    { id: "tar_reuse_goal", measureId: "mea_reuse", label: "goal", value: "3 validated cloud patterns reused by more than one team per quarter", createdAt: now, updatedAt: now },
    { id: "tar_reuse_wish", measureId: "mea_reuse", label: "wish", value: "6 validated cloud patterns reused by more than one team per quarter", createdAt: now, updatedAt: now }
  ];
  const strategyGroups: StrategyGroupItem[] = [
    { id: "grp_value_discovery", title: "Value discovery and planning", description: "Approaches that improve how CBG frames values, measures, targets, and strategic choices.", owner: "TBD", createdAt: now, updatedAt: now },
    { id: "grp_market_activation", title: "Market activation", description: "Strategies that turn CBG value thinking into reusable client-facing material and motions.", owner: "TBD", createdAt: now, updatedAt: now },
    { id: "grp_reuse", title: "Reusable delivery patterns", description: "Strategies that codify and reuse proven cloud solution thinking.", owner: "TBD", createdAt: now, updatedAt: now }
  ];
  const strategies: StrategyItem[] = [
    { id: "str_commitlab_workshops", groupId: "grp_value_discovery", title: "Run value discovery workshops with EPAM stakeholders", owner: "TBD", effort: "medium", status: "draft", createdAt: now, updatedAt: now },
    { id: "str_governance", groupId: "grp_value_discovery", title: "Create lightweight strategy review governance", owner: "TBD", effort: "medium", status: "draft", createdAt: now, updatedAt: now },
    { id: "str_conlab_gtm", groupId: "grp_market_activation", title: "Craft multicloud GTM package in ConLab", owner: "TBD", effort: "medium", status: "draft", createdAt: now, updatedAt: now },
    { id: "str_pattern_library", groupId: "grp_reuse", title: "Build reusable cloud pattern library", owner: "TBD", effort: "large", status: "draft", createdAt: now, updatedAt: now }
  ];
  workspace.values = values;
  workspace.measures = measures;
  workspace.targets = targets;
  workspace.strategyGroups = strategyGroups;
  workspace.strategies = strategies;
  workspace.expectedImpacts = [
    makeImpact("str_commitlab_workshops", "mea_quality_review", 0.8, "medium", "Workshops should make values, measures, and strategy assumptions explicit before execution starts."),
    makeImpact("str_commitlab_workshops", "mea_alignment", 0.9, "medium", "Shared review should expose mismatches between organizational priorities and client-facing strategies."),
    makeImpact("str_conlab_gtm", "mea_alignment", 0.5, "medium", "A ConLab-crafted GTM package can express one strategy clearly, but it must trace back to CommitLab values."),
    makeImpact("str_pattern_library", "mea_reuse", 0.9, "medium", "Reusable patterns directly support reuse across initiatives."),
    makeImpact("str_governance", "mea_quality_review", 0.4, "low", "Governance may improve consistency if it stays lightweight and evidence-oriented.")
  ];
  workspace.evidence = [
    {
      id: "ev_org_notes",
      title: "EPAM stakeholder review notes",
      description: "Initial notes from organizational value and strategy review sessions.",
      sourceType: "meeting",
      source: "",
      createdAt: now,
      updatedAt: now
    }
  ];
  workspace.actualMovements = [
    {
      id: "mov_first_review",
      valueId: "val_reuse",
      observedValue: "Two teams reused the same cloud pattern in separate opportunity discussions.",
      observationDate: "2026-07-15",
      comment: "Demo observation for the first workspace draft.",
      evidenceId: "ev_org_notes",
      createdAt: now,
      updatedAt: now
    }
  ];
  return workspace;
}

function makeImpact(strategyId: string, measureId: string, score: number, confidence: ExpectedImpactItem["confidence"], rationale: string): ExpectedImpactItem {
  const now = nowIso();
  return {
    id: newId("imp"),
    strategyId,
    measureId,
    score,
    confidence,
    rationale,
    createdAt: now,
    updatedAt: now
  };
}

export function loadWorkspace(): CommitLabWorkspace {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createEmptyWorkspace();
  }
  try {
    return normalizeWorkspace(JSON.parse(raw));
  } catch {
    return createEmptyWorkspace();
  }
}

export function saveWorkspace(workspace: CommitLabWorkspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace, null, 2));
}

export function normalizeWorkspace(input: unknown): CommitLabWorkspace {
  const fallback = createEmptyWorkspace();
  if (!input || typeof input !== "object") {
    return fallback;
  }
  const source = input as Partial<CommitLabWorkspace>;
  const normalized: CommitLabWorkspace = {
    ...fallback,
    ...source,
    schemaVersion: "1.0.0",
    workspace: { ...fallback.workspace, ...source.workspace },
    values: source.values ?? [],
    measures: migrateMeasures(source.measures ?? [], source.targets ?? []),
    targets: (source.targets ?? []).map((target) => ({ ...target, measureId: target.measureId ?? source.measures?.[0]?.id ?? "", label: normalizeTargetLabel(target.label) })),
    strategyGroups: source.strategyGroups ?? [],
    strategies: (source.strategies ?? []).map((strategy) => ({ ...strategy, groupId: strategy.groupId ?? source.strategyGroups?.[0]?.id })),
    expectedImpacts: (source.expectedImpacts ?? []).map((impact) => migrateImpact(impact, source.targets ?? [])),
    evidence: source.evidence ?? [],
    actualMovements: source.actualMovements ?? [],
    settings: {
      gitlab: {
        ...fallback.settings.gitlab,
        ...source.settings?.gitlab
      }
    }
  };
  if (
    normalized.workspace.name === "Digital Sovereignty GTM Value Planning" ||
    normalized.workspace.name === "EPAM Multicloud Value Planning"
  ) {
    return createDemoWorkspace();
  }
  return normalized;
}

export function createEntity(type: EntityType, workspace: CommitLabWorkspace) {
  const now = nowIso();
  switch (type) {
    case "values":
      return { id: newId("val"), title: "New value", priority: "medium", createdAt: now, updatedAt: now } satisfies ValueItem;
    case "measures":
      return { id: newId("mea"), title: "New measure", createdAt: now, updatedAt: now } satisfies MeasureItem;
    case "targets":
      return { id: newId("tar"), measureId: workspace.measures[0]?.id ?? "", label: "goal", value: "New target", createdAt: now, updatedAt: now } satisfies TargetItem;
    case "strategyGroups":
      return { id: newId("grp"), title: "New strategy group", createdAt: now, updatedAt: now } satisfies StrategyGroupItem;
    case "strategies":
      return { id: newId("str"), groupId: workspace.strategyGroups[0]?.id, title: "New strategy", effort: "unknown", status: "draft", createdAt: now, updatedAt: now } satisfies StrategyItem;
    case "expectedImpacts":
      return {
        id: newId("imp"),
        strategyId: workspace.strategies[0]?.id ?? "",
        measureId: workspace.measures[0]?.id ?? "",
        score: 0,
        confidence: "unknown",
        createdAt: now,
        updatedAt: now
      } satisfies ExpectedImpactItem;
    case "evidence":
      return { id: newId("ev"), title: "New evidence", sourceType: "note", createdAt: now, updatedAt: now } satisfies EvidenceItem;
    case "actualMovements":
      return { id: newId("mov"), observedValue: "New observation", createdAt: now, updatedAt: now } satisfies ActualMovementItem;
  }
}

export function getEntityTitle(workspace: CommitLabWorkspace, type: EntityType | undefined, id: string | undefined) {
  if (!type || !id) return "";
  const collections = {
    values: workspace.values,
    measures: workspace.measures,
    targets: workspace.targets,
    strategyGroups: workspace.strategyGroups,
    strategies: workspace.strategies,
    expectedImpacts: workspace.expectedImpacts,
    evidence: workspace.evidence,
    actualMovements: workspace.actualMovements
  };
  const item = collections[type]?.find((candidate) => candidate.id === id);
  if (!item) return "";
  if ("title" in item) return item.title;
  if ("value" in item) return item.value;
  if ("observedValue" in item) return item.observedValue ?? item.id;
  return item.id;
}

export function collectionFor(type: EntityType, workspace: CommitLabWorkspace) {
  return workspace[type];
}

function migrateImpact(
  impact: Partial<ExpectedImpactItem> & { targetId?: string; impact?: string },
  targets: TargetItem[]
): ExpectedImpactItem {
  const measureId = impact.measureId ?? targets.find((target) => target.id === impact.targetId)?.measureId ?? "";
  return {
    id: impact.id ?? newId("imp"),
    strategyId: impact.strategyId ?? "",
    measureId,
    score: typeof impact.score === "number" ? impact.score : impactLevelToScore(impact.impact),
    confidence: impact.confidence ?? "unknown",
    rationale: impact.rationale,
    evidenceId: impact.evidenceId,
    createdAt: impact.createdAt ?? nowIso(),
    updatedAt: impact.updatedAt ?? nowIso()
  };
}

function impactLevelToScore(level: string | undefined) {
  if (level === "high") return 0.8;
  if (level === "medium") return 0.5;
  if (level === "low") return 0.25;
  return 0;
}

function normalizeTargetLabel(label: TargetItem["label"] | string | undefined): TargetItem["label"] {
  if (label === "baseline") return "actual";
  if (label === "target" || label === "stretch") return "goal";
  if (label === "actual" || label === "tolerable" || label === "goal" || label === "wish") return label;
  return "goal";
}

function migrateMeasures(measures: MeasureItem[], targets: TargetItem[]): MeasureItem[] {
  return measures.map((measure) => {
    const measureTargets = targets.filter((target) => target.measureId === measure.id);
    const actual = measureTargets.find((target) => normalizeTargetLabel(target.label) === "actual");
    const tolerable = measureTargets.find((target) => normalizeTargetLabel(target.label) === "tolerable");
    const goal = measureTargets.find((target) => normalizeTargetLabel(target.label) === "goal");
    const wish = measureTargets.find((target) => normalizeTargetLabel(target.label) === "wish");
    return {
      ...measure,
      now: measure.now ?? actual?.value,
      tolerable: measure.tolerable ?? tolerable?.value,
      target: measure.target ?? goal?.value,
      wish: measure.wish ?? wish?.value
    };
  });
}
