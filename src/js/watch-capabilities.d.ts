import type { InterpretationV1, CompiledMonitoringPlanV1 } from './watch-interpretation.js';
export interface CapabilityAssessment {
  status: 'supported' | 'unsupported' | 'clarification_required' | 'invalid_interpretation';
  registryVersion: 'capabilities.v1'; issues: { code: string; field: string }[];
  clarifications: { code: string; field: string; options: string[] }[];
  plan: CompiledMonitoringPlanV1 | null;
  alternative: { kind: 'separate_subject_requests'; subjects: string[]; requiresConfirmation: true } | null;
}
export const capabilityRegistry: Readonly<{ version: 'capabilities.v1'; capabilities: readonly object[] }>;
export function interpretationFingerprint(value: InterpretationV1): string;
export function assessCapabilities(value: unknown, options?: { structured?: boolean }): CapabilityAssessment;
export function compileMonitoringPlan(value: InterpretationV1, options?: { structured?: boolean }): CompiledMonitoringPlanV1;
export function validateCompiledMonitoringPlan(plan: unknown, value: InterpretationV1, options?: { structured?: boolean }): CompiledMonitoringPlanV1;
