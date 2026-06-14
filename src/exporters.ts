import type { CommitLabWorkspace, ExpectedImpactItem } from "./types";

export function buildMarkdown(workspace: CommitLabWorkspace) {
  const lines: string[] = [];
  lines.push("# CommitLab Workspace", "");
  lines.push("## Workspace", "");
  lines.push(`- Name: ${workspace.workspace.name || "Untitled"}`);
  lines.push(`- Cycle: ${workspace.workspace.cycle || "Not set"}`);
  lines.push(`- Owner: ${workspace.workspace.owner || "Not set"}`);
  lines.push(`- Description: ${workspace.workspace.description || "Not set"}`, "");
  section(lines, "Values", workspace.values.map((item) => `- ${item.title}${item.priority ? ` (${item.priority})` : ""}${item.ambition ? `: ${item.ambition}` : ""}`));
  section(lines, "Measures", workspace.measures.map((item) => `- ${item.title}${item.unit ? ` [${item.unit}]` : ""}: now ${item.now ?? ""}, target ${item.target ?? ""}, wish ${item.wish ?? ""}, tolerable ${item.tolerable ?? ""}`));
  section(lines, "Targets", workspace.targets.map((item) => `- ${item.label}: ${item.value}`));
  section(lines, "Strategy Groups", workspace.strategyGroups.map((item) => `- ${item.title}${item.owner ? ` (owner: ${item.owner})` : ""}`));
  section(lines, "Strategies", workspace.strategies.map((item) => `- ${item.title}${item.owner ? ` (owner: ${item.owner})` : ""}`));
  section(
    lines,
    "Expected Impacts",
    workspace.expectedImpacts.map((item) => `- ${entityName(workspace, item)}: ${formatScore(item.score)}, confidence ${item.confidence ?? "unknown"}`)
  );
  section(lines, "Evidence", workspace.evidence.map((item) => `- ${item.title}${item.source ? `: ${item.source}` : ""}`));
  section(lines, "Actual Movement", workspace.actualMovements.map((item) => `- ${item.observedValue || item.comment || item.id}`));
  lines.push("## Impact Table", "");
  const rows = measurementRows(workspace);
  if (rows.length === 0 || workspace.strategies.length === 0) {
    lines.push("No complete Value / Measurement x Strategy table yet.");
  } else {
    lines.push(["Value", "Ambition", "Measurement", "Now", "Target", "Wish", "Tolerable", ...workspace.strategies.map((strategy) => strategy.title)].join(" | "));
    lines.push(["---", "---", "---", "---", "---", "---", "---", ...workspace.strategies.map(() => "---")].join(" | "));
    for (const row of rows) {
      lines.push([
        row.value?.title ?? "Unlinked value",
        row.value?.ambition ?? "",
        row.measure.title,
        row.measure.now ?? "",
        row.measure.target ?? "",
        row.measure.wish ?? "",
        row.measure.tolerable ?? "",
        ...workspace.strategies.map((strategy) => impactFor(workspace.expectedImpacts, row.measure.id, strategy.id))
      ].join(" | "));
    }
  }
  return lines.join("\n");
}

function section(lines: string[], title: string, items: string[]) {
  lines.push(`## ${title}`, "");
  lines.push(...(items.length ? items : ["Nothing created yet."]));
  lines.push("");
}

function impactFor(items: ExpectedImpactItem[], measureId: string, strategyId: string): string {
  const impact = items.find((item) => item.measureId === measureId && item.strategyId === strategyId);
  return impact ? formatScore(impact.score) : "";
}

function entityName(workspace: CommitLabWorkspace, impact: ExpectedImpactItem) {
  const strategy = workspace.strategies.find((item) => item.id === impact.strategyId)?.title ?? "Unlinked strategy";
  const row = measurementRows(workspace).find((candidate) => candidate.measure.id === impact.measureId);
  if (!row) return `${strategy} -> Unlinked measurement`;
  return `${strategy} -> ${row.value?.title ?? "Unlinked value"} / ${row.measure.title}`;
}

function measurementRows(workspace: CommitLabWorkspace) {
  return workspace.measures.map((measure) => {
    const value = workspace.values.find((item) => item.id === measure.valueId);
    return { measure, value };
  });
}

function formatScore(score: number | undefined) {
  return typeof score === "number" ? score.toFixed(2) : "0.00";
}

export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
