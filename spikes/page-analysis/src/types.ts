export type AnalysisStatus = 'supported' | 'review-required' | 'unsupported';

export type BoundaryKind = 'iframe';

export interface ControlAnalysis {
  element: string;
  control: string;
  status: AnalysisStatus;
  reasons: string[];
  required: boolean;
  frameDepth: number;
  shadowDepth: number;
}

export interface BoundaryAnalysis {
  kind: BoundaryKind;
  reason: 'inaccessible-frame';
  frameDepth: number;
  shadowDepth: number;
}

export interface PageAnalysis {
  controls: ControlAnalysis[];
  boundaries: BoundaryAnalysis[];
}
