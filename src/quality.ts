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

export function qualityHints(type: EntityType, item: unknown, workspace: CommitLabWorkspace): string[] {
  switch (type) {
    case "values":
      return valueHints(item as ValueItem, workspace);
    case "measures":
      return measureHints(item as MeasureItem, workspace);
    case "targets":
      return targetHints(item as TargetItem, workspace);
    case "strategyGroups":
      return strategyGroupHints(item as StrategyGroupItem, workspace);
    case "strategies":
      return strategyHints(item as StrategyItem, workspace);
    case "expectedImpacts":
      return impactHints(item as ExpectedImpactItem);
    case "evidence":
      return evidenceHints(item as EvidenceItem);
    case "actualMovements":
      return movementHints(item as ActualMovementItem);
  }
}

export function workspaceHints(workspace: CommitLabWorkspace) {
  return [
    ...workspace.values.flatMap((item) => qualityHints("values", item, workspace).map((hint) => `${item.title}: ${hint}`)),
    ...workspace.measures.flatMap((item) => qualityHints("measures", item, workspace).map((hint) => `${item.title}: ${hint}`)),
    ...workspace.strategies.flatMap((item) => qualityHints("strategies", item, workspace).map((hint) => `${item.title}: ${hint}`)),
    ...workspace.expectedImpacts.flatMap((item) => qualityHints("expectedImpacts", item, workspace).map((hint) => `Impact ${item.id}: ${hint}`))
  ];
}

function valueHints(value: ValueItem, workspace: CommitLabWorkspace) {
  const hints: string[] = [];
  if (!workspace.measures.some((measure) => measure.valueId === value.id)) hints.push("No measure defined.");
  if (!value.ambition) hints.push("No ambition statement defined.");
  if (!workspace.measures.some((measure) => measure.valueId === value.id && measure.target)) hints.push("No target score defined.");
  if (!workspace.expectedImpacts.some((impact) => measureBelongsToValue(workspace, impact.measureId, value.id))) hints.push("No strategy impact linked to this value's measurements.");
  if (!value.stakeholder) hints.push("No stakeholder defined.");
  return hints;
}

function measureHints(measure: MeasureItem, workspace: CommitLabWorkspace) {
  const hints: string[] = [];
  if (!measure.valueId) hints.push("No linked value.");
  if (!measure.unit) hints.push("No unit defined.");
  if (!measure.dataSource) hints.push("No data source defined.");
  if (!measure.meter) hints.push("No measurement scale defined.");
  if (!measure.now) hints.push("No now value defined.");
  if (!measure.target) hints.push("No target value defined.");
  if (!measure.wish) hints.push("No wish value defined.");
  if (!measure.tolerable) hints.push("No tolerable value defined.");
  return hints;
}

function targetHints(target: TargetItem, workspace: CommitLabWorkspace) {
  const hints: string[] = [];
  if (!target.measureId) hints.push("Target is not linked to a Measure.");
  if (!workspace.expectedImpacts.some((impact) => impact.measureId === target.measureId)) hints.push("No strategy impact defined for this measure.");
  if (!target.rationale) hints.push("No rationale defined.");
  return hints;
}

function strategyGroupHints(group: StrategyGroupItem, workspace: CommitLabWorkspace) {
  const hints: string[] = [];
  if (!workspace.strategies.some((strategy) => strategy.groupId === group.id)) hints.push("Strategy group has no distinct strategies.");
  if (!group.owner) hints.push("Strategy group has no owner.");
  return hints;
}

function strategyHints(strategy: StrategyItem, workspace: CommitLabWorkspace) {
  const hints: string[] = [];
  if (!strategy.groupId) hints.push("Strategy has no group.");
  if (!strategy.owner) hints.push("Strategy has no owner.");
  if (!workspace.expectedImpacts.some((impact) => impact.strategyId === strategy.id)) hints.push("Strategy has no expected impact yet.");
  return hints;
}

function impactHints(impact: ExpectedImpactItem) {
  const hints: string[] = [];
  if (!impact.strategyId) hints.push("No strategy linked.");
  if (!impact.measureId) hints.push("No measurement row linked.");
  if (impact.score < 0 || impact.score > 1) hints.push("Impact score must be between 0 and 1.");
  if (!impact.rationale) hints.push("No rationale defined.");
  if (!impact.evidenceId) hints.push("No evidence linked.");
  if (!impact.confidence || impact.confidence === "unknown") hints.push("Confidence is unknown.");
  return hints;
}

function evidenceHints(evidence: EvidenceItem) {
  const hints: string[] = [];
  if (!evidence.linkedEntityType || !evidence.linkedEntityId) hints.push("Evidence is not linked to any entity.");
  if (!evidence.sourceType) hints.push("No source type defined.");
  if (!evidence.source && !evidence.description) hints.push("No source or description provided.");
  return hints;
}

function movementHints(movement: ActualMovementItem) {
  const hints: string[] = [];
  if (!movement.valueId && !movement.measureId && !movement.targetId) hints.push("No linked value, measure, or target.");
  if (!movement.evidenceId) hints.push("No evidence linked.");
  if (!movement.observationDate) hints.push("No observation date.");
  if (!movement.observedValue) hints.push("No observed value.");
  return hints;
}

function measureBelongsToValue(workspace: CommitLabWorkspace, measureId: string, valueId: string) {
  const measure = workspace.measures.find((item) => item.id === measureId);
  return measure?.valueId === valueId;
}
