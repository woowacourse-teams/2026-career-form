export type AnalysisStatus = 'supported' | 'review-required' | 'unsupported';
export type Visibility = 'visible' | 'hidden';

export type BoundaryKind = 'iframe';

export interface ControlAnalysis {
  element: string;
  control: string;
  domId: string;
  domName: string;
  displayName: string;
  profileField: string;
  section: string;
  confidence: 'exact' | 'heuristic' | 'unknown';
  visibility: Visibility;
  status: AnalysisStatus;
  reasons: string[];
  required: boolean;
  frameDepth: number;
  shadowDepth: number;
}

export interface ActionAnalysis {
  action: string;
  element: string;
  domId: string;
  domName: string;
  displayName: string;
  kind: 'reveal' | 'navigation' | 'unsafe' | 'unknown';
  visibility: Visibility;
  safeToInvoke: boolean;
}

export interface BoundaryAnalysis {
  kind: BoundaryKind;
  reason: 'inaccessible-frame';
  frameDepth: number;
  shadowDepth: number;
}

export interface PageAnalysis {
  controls: ControlAnalysis[];
  actions: ActionAnalysis[];
  boundaries: BoundaryAnalysis[];
}
