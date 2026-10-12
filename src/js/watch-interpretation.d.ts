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
export interface PendingMonitoringPlanV1 {
  schemaVersion: 'monitoring-plan.v1'; interpretationVersion: 'interpretation.v1';
  originalRequest: string; status: 'not_assessed'; executable: false;
}
export interface CompiledMonitoringPlanV1 extends Omit<PendingMonitoringPlanV1, 'status'> {
  status: 'supported'; registryVersion: 'capabilities.v1'; interpretationRef: string;
  domain: 'media_news' | 'currency' | 'official_company';
  adapter: 'google_news_literal_v1' | 'ecb_reference_v1' | 'bodacc_siren_v1';
  subjects: Subject[]; conditions: Condition[]; condition: string;
  topics: InterpretationV1['topics']; exclusions: string[]; geographic: InterpretationV1['geographic'];
  recurrence: InterpretationV1['recurrence']; limitations: string[];
  criteria: { kind: 'media_literal'; subjects: string[]; matchMode: 'all'; topics: string[]; exclusions: string[]; query: string; edition: 'GB:en' }
    | { kind: 'ecb_threshold'; base: 'GBP' | 'EUR'; quote: 'GBP' | 'EUR'; operator: 'gt' | 'gte'; target: string; policy: 'once' | 'crossing' | 'daily' }
    | { kind: 'bodacc_siren'; siren: string; country: 'FR' };
}
export type MonitoringPlanV1 = PendingMonitoringPlanV1 | CompiledMonitoringPlanV1;
export const interpretationSchema: object;
export const interpretationOutputSchema: object;
export const monitoringPlanSchema: object;
export function validateInterpretation(value: unknown, request?: string): InterpretationV1;
export type InterpretationOutputV1 = Omit<InterpretationV1, 'originalRequest' | 'evidence'> & {
  evidence: { path: string; quote: string; context: string | null }[];
};
export function reconstructInterpretation(output: unknown, request: string): InterpretationV1;
export function validateMonitoringPlan(value: unknown): MonitoringPlanV1;
