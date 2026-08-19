/**
 * Editorial Review Card Canvas Types and Options
 */

export type VerdictType = 'publier' | 'corrections' | 'reviser' | 'bloquer';

export interface DomainScoreItem {
  id: string;
  name: string;
  score: number; // 0-100
  weight?: number;
}

export interface KeyFindingItem {
  id: string;
  category: 'sophisme' | 'unsupported' | 'overreach' | 'sourceAbsent' | 'framing' | 'strength';
  severity: 'critical' | 'major' | 'minor' | 'info';
  title: string;
  excerpt?: string;
}

export interface EditorialCardData {
  title: string;
  url?: string;
  publicationDate?: string;
  reviewDate?: string;
  reviewer?: string;
  reliabilityScore: number; // 0-100
  verdict: VerdictType;
  domainScores: DomainScoreItem[];
  keyFindings: KeyFindingItem[];
  summaryText?: string;
  branding?: {
    appName?: string;
    tagline?: string;
    edition?: string;
  };
}

export interface CanvasExportOptions {
  width?: number; // Base CSS logical width, default: 800
  height?: number; // Base CSS logical height, default: 1000
  pixelRatio?: number; // Scaling factor for Retina crispness (default: 2)
  theme?: 'light' | 'dark';
  fontFamilyHeading?: string;
  fontFamilyBody?: string;
  fontFamilyMono?: string;
}
