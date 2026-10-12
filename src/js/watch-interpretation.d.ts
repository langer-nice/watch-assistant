export type Subject = {
  id: string; kind: 'individual' | 'open_group' | 'closed_group';
  type: 'person' | 'organization' | 'product' | 'event' | 'topic' | 'currency' | 'place' | 'unknown';
  label: string; canonicalCode: 'GBP' | 'EUR' | null;
  membership: { attribute: 'nationality' | 'sport' | 'tour' | 'country_association' | 'industry' | 'other'; operator: 'eq' | 'in'; values: string[] }[];
  members: string[]; quantifier: 'any' | 'all' | null;
};
export type Condition = { id: string; op: 'and' | 'or' | 'not'; args: string[] } | {
  id: string; op: 'predicate';
  kind: 'news_about' | 'mentions_together' | 'event' | 'relationship' | 'numeric' | 'topic' | 'temporal' | 'geographic';
  subjects: string[]; value: string | null; operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | null;
  amount: string | null; unit: string | null;
};
export interface InterpretationV1 {
  schemaVersion: 'interpretation.v1'; originalRequest: string;
  language: 'en' | 'fr' | 'mixed' | 'und';
  intent: 'ongoing_news' | 'event' | 'numeric_condition' | 'change' | 'unknown';
  domain: 'media_news' | 'currency' | 'official_company' | 'ticket_availability' | 'other' | 'unknown';
  subjects: Subject[]; conditions: Condition[]; condition: string | null;
  topics: { label: string; role: 'required' | 'coverage_focus' }[];
  temporal: { text: string; relation: 'before' | 'after' | 'between' | 'at' | 'relative' | 'unspecified';
    start: string | null; end: string | null; timezone: string | null }[];
  geographic: { label: string; appliesTo: 'subject' | 'event' | 'source' | 'content_language' }[];
  exclusions: string[];
  recurrence: 'once' | 'crossing' | 'per_observation' | 'per_new_item' | 'unspecified';
  ambiguities: { field: string; alternatives: string[]; question: string }[];
  unresolvedRequirements: { text: string; reason: string }[];
  evidence: { path: string; start: number; end: number; text: string }[];
}
export interface MonitoringPlanV1 {
  schemaVersion: 'monitoring-plan.v1'; interpretationVersion: 'interpretation.v1';
  originalRequest: string; status: 'not_assessed'; executable: false;
}
export const interpretationSchema: object;
export const interpretationOutputSchema: object;
export const monitoringPlanSchema: object;
export function validateInterpretation(value: unknown, request?: string): InterpretationV1;
export type InterpretationOutputV1 = Omit<InterpretationV1, 'originalRequest' | 'evidence'> & {
  evidence: { path: string; quote: string; context: string | null }[];
};
export function reconstructInterpretation(output: unknown, request: string): InterpretationV1;
export function validateMonitoringPlan(value: unknown): MonitoringPlanV1;
