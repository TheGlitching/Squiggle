/**
 * The single shared RPC contract between the sidepanel and the background
 * worker.
 *
 * Without this, `registerRPC`/`callRPC` fell back to the default
 * `RPCProtocolMap`, whose request and response are both `unknown`. Every
 * handler was therefore untyped at the boundary and every caller had to cast,
 * so a payload-shape drift between the two sides could not be caught.
 */

import type { AnalysisResult, Finding, PipelineStatus } from '../engine/types';
import type { ExtractedArticle } from '../content/types';

export interface TabAnalysisSnapshot {
  tabId: number;
  url?: string;
  title?: string;
  status: PipelineStatus;
  progress: number;
  currentStep?: string;
  article?: ExtractedArticle;
  findings?: Finding[];
  result?: AnalysisResult;
  error?: string;
  selectedFindingId?: string | null;
  hoveredFindingId?: string | null;
  lastUpdated?: number;
}

export interface AnalysisOutcome {
  success: boolean;
  result?: AnalysisResult;
  error?: string;
}

export interface FcRpcMap {
  // The bus constrains its map to RPCProtocolMap, which carries a string index
  // signature. Declared members still take precedence over it, so each named
  // channel below keeps its exact request/response types.
  [channel: string]: { request: unknown; response: unknown };
  GET_TAB_STATE: {
    request: { tabId?: number };
    response: { state: TabAnalysisSnapshot | null };
  };
  TRIGGER_ANALYSIS: {
    request: { tabId?: number; articleText?: string; articleTitle?: string };
    response: AnalysisOutcome;
  };
  CANCEL_ANALYSIS: {
    request: { tabId: number };
    response: { success: boolean };
  };
  SELECT_FINDING: {
    request: { tabId?: number; findingId: string | null };
    response: { success: boolean };
  };
}

/** Event payloads dispatched by the background worker (fire-and-forget). */
export interface FcEventMap {
  ANALYSIS_PROGRESS: {
    tabId: number;
    status: PipelineStatus | 'completed';
    stage: string;
    message: string;
    progress: number;
    partialText?: string;
    error?: string;
  };
  ANALYSIS_COMPLETE: { tabId: number; result: AnalysisResult };
  ANALYSIS_ERROR: { tabId: number; error: string };
  FC_SIDEBAR_FINDING_SELECTED: { tabId?: number; findingId?: string };
  FC_SIDEBAR_FINDING_HOVERED: { tabId?: number; findingId?: string };
}
