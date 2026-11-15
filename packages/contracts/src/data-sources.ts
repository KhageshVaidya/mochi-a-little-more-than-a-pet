import type { HealthRecord, DayRange } from './records';
import type { SourceKind } from './provenance';
import type { HrpRiskId } from './signals';

/** Workstream B implements adapters; main's DataSourceRegistry consumes them. */

export interface ProvenanceDoc {
  title: string;
  summary: string;
  licenceOrTerms: string;
  limitations: string[];
  citation?: string;
  retrievedAt?: string;
}

/** NASA / knowledge content (not a measurement). */
export interface ReferenceItem {
  id: string;
  kind: 'hrp-hazard' | 'hrp-risk' | 'osdr-study' | 'reference-range';
  title: string;
  summary: string;
  url: string;
  retrievedAt: string;
  relatedRisks?: HrpRiskId[];
}

export interface DataSourceAdapter {
  readonly id: string;
  readonly kind: SourceKind;
  /** Online adapters are off by default and only ever called from the main process. */
  readonly online: boolean;
  describe(): ProvenanceDoc;
}

export interface RecordSource extends DataSourceAdapter {
  loadRecords(range: DayRange): Promise<HealthRecord[]>;
}

export interface ReferenceSource extends DataSourceAdapter {
  loadReferences(): Promise<ReferenceItem[]>;
}
