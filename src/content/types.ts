/**
 * Content Script & In-Page Overlay Types
 * Squiggle Editorial Verification Extension
 */

export type {
  ArticleMetadata,
  CitedSource,
  DOMNodeCoordinates,
  ExtractedArticle,
  TextBlock,
} from '../../shared/src/extract/types';
import type { DOMNodeCoordinates } from '../../shared/src/extract/types';

export type HighlightSeverity = 'critical' | 'warning' | 'info' | 'positive';

export type HighlightCategory =
  | 'logical_fallacy'
  | 'unverified_source'
  | 'factual_error'
  | 'manipulation'
  | 'editorial_bias'
  | 'missing_context'
  | 'methodological_flaw'
  | 'rigorous_journalism';

export interface FindingHighlightTarget {
  findingId: string;
  blockId?: string;
  quote: string;
  prefix?: string;
  suffix?: string;
  severity: HighlightSeverity;
  category: HighlightCategory;
  title: string;
  explanation: string;
  domCoordinates?: DOMNodeCoordinates;
}

export type AnchorTier = 'dom-range' | 'exact-quote' | 'fuzzy-match' | 'unanchored';

export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  lineIndex: number;
}

export interface AnchoredHighlight {
  id: string;
  findingId: string;
  target: FindingHighlightTarget;
  tier: AnchorTier;
  confidence: number; // 0.0 - 1.0
  range: Range | null;
  matchedText: string;
  blockIndex: number;
  rects: HighlightRect[];
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

export interface OverlayTheme {
  criticalColor: string;
  criticalBg: string;
  warningColor: string;
  warningBg: string;
  infoColor: string;
  infoBg: string;
  positiveColor: string;
  positiveBg: string;
}

export type ContentScriptMessageType =
  | 'FC_PING'
  | 'FC_DETECT_ARTICLE'
  | 'FC_EXTRACT_CONTENT'
  | 'FC_APPLY_HIGHLIGHTS'
  | 'FC_CLEAR_HIGHLIGHTS'
  | 'FC_SCROLL_TO_HIGHLIGHT'
  | 'FC_HOVER_HIGHLIGHT'
  | 'FC_UNHOVER_HIGHLIGHT'
  | 'FC_HIGHLIGHT_CLICKED'
  | 'FC_HIGHLIGHT_HOVERED'
  | 'FC_GET_VIEWPORT_HIGHLIGHTS'
  | 'FC_OVERLAY_STATE_CHANGED';

export interface ContentScriptMessage<T = unknown> {
  type: ContentScriptMessageType;
  payload?: T;
  source?: 'sidepanel' | 'background' | 'content-script';
  timestamp?: number;
}

export interface ContentScriptResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
