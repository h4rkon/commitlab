import type { ExpectedImpactItem, MeasureItem } from "./types";

export interface MeasureForCalculation {
  now?: number;
  target?: number;
  unit?: string;
}

export interface CalculatedImpact {
  rawProjectedValue?: number;
  rawDelta?: number;
  riskAdjustedDelta?: number;
  riskAdjustedProjectedValue?: number;
  calculationWarning?: string;
}

export function calculateExpectedImpact(measure: MeasureForCalculation, impact: ExpectedImpactItem): CalculatedImpact {
  const now = measure.now;
  const target = measure.target;
  const confidence = impact.confidenceScore ?? 0;

  if (now === undefined || now === null) {
    return { calculationWarning: "Projection cannot be calculated because Now value is missing." };
  }

  if (!Number.isFinite(impact.impactValue)) {
    return { calculationWarning: "Projection cannot be calculated because impact value is missing." };
  }

  let rawProjectedValue: number | undefined;

  if (impact.impactMode === "absolute") {
    if (!impact.numericDirection) {
      return { calculationWarning: "Absolute impact requires numeric direction." };
    }
    const signedDelta = impact.numericDirection === "increase" ? impact.impactValue : -impact.impactValue;
    rawProjectedValue = now + signedDelta;
  }

  if (impact.impactMode === "relative") {
    if (!impact.numericDirection) {
      return { calculationWarning: "Relative impact requires numeric direction." };
    }
    const factor = impact.impactValue / 100;
    rawProjectedValue = impact.numericDirection === "increase" ? now * (1 + factor) : now * (1 - factor);
  }

  if (impact.impactMode === "gapClosure") {
    if (target === undefined || target === null) {
      return { calculationWarning: "Gap closure impact requires Target value." };
    }
    const gapClosure = impact.impactValue / 100;
    rawProjectedValue = now + (target - now) * gapClosure;
  }

  if (rawProjectedValue === undefined) {
    return { calculationWarning: "Projection could not be calculated." };
  }

  const rawDelta = rawProjectedValue - now;
  const riskAdjustedDelta = rawDelta * confidence;
  const riskAdjustedProjectedValue = now + riskAdjustedDelta;

  return {
    rawProjectedValue,
    rawDelta,
    riskAdjustedDelta,
    riskAdjustedProjectedValue
  };
}

export function measureForCalculation(measure: MeasureItem): MeasureForCalculation {
  return {
    now: parseMeasurementNumber(measure.now),
    target: parseMeasurementNumber(measure.target),
    unit: measure.unit
  };
}

export function parseMeasurementNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/[-+]?\d*\.?\d+/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatCalculatedValue(value: number | undefined, unit: string | undefined) {
  if (value === undefined) return "";
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (!unit) return formatted;
  if (unit.includes("%") || unit.toLowerCase().includes("percent")) return `${formatted}%`;
  return `${formatted} ${unit}`;
}

export function formatImpactSummary(impact: ExpectedImpactItem) {
  const sign = impact.numericDirection === "decrease" ? "-" : "+";
  const suffix = impact.impactMode === "absolute" ? "" : "%";
  return `${impact.impactMode === "gapClosure" ? "" : sign}${impact.impactValue}${suffix} ${impact.impactMode}`;
}
