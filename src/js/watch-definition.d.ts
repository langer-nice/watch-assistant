import type { InterpretationV1, CompiledMonitoringPlanV1 } from './watch-interpretation.js';
export interface WatchDefinitionV1 {
  definitionVersion: 'watch-definition.v1'; inputType: 'text'; request: string;
  category: 'general' | 'travel' | 'news' | 'property' | 'price' | 'events' | 'entertainment' | 'finance';
  interpretation: Omit<InterpretationV1, 'originalRequest'>;
  plan: Omit<CompiledMonitoringPlanV1, 'originalRequest' | 'subjects' | 'conditions' | 'condition' | 'topics' | 'exclusions' | 'geographic' | 'recurrence'>;
  metadata: { validatorVersion: 'watch-definition-validator.v1'; compilerVersion: 'watch-definition-compiler.v1'; planFingerprint: string };
}
export const watchDefinitionSchema: object;
export const WATCH_DEFINITION_VERSION: 'watch-definition.v1';
export const WATCH_DEFINITION_VALIDATOR: 'watch-definition-validator.v1';
export const WATCH_DEFINITION_COMPILER: 'watch-definition-compiler.v1';
export const WATCH_DEFINITION_MAX_BYTES: number;
export function hasDefinitionVersion(value: unknown): boolean;
export function validateWatchDefinition(value: unknown, source?: unknown): WatchDefinitionV1;
export function createWatchDefinition(interpretation: InterpretationV1, plan: CompiledMonitoringPlanV1, options?: { category?: string }): WatchDefinitionV1;
export function monitoringPlanForDefinition(value: unknown): CompiledMonitoringPlanV1;
export function structuredMonitoringSource(criteria: CompiledMonitoringPlanV1['criteria']): object;
export function watchDefinitionSize(value: unknown): number;
export function definitionFromWatch(value: object): WatchDefinitionV1;
