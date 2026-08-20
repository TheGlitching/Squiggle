/**
 * Content Script Controller & Runtime Messaging Bridge
 *
 * Coordinates:
 * - Article detection & semantic extraction
 * - Range tracking & anchoring
 * - Shadow DOM overlay rendering & responsive repositioning
 * - Bidirectional synchronization with Chrome / Firefox Sidepanel & Background Service Worker
 */

import { ArticleExtractor } from './extractor';
import { detectSocialPlatform } from './socialPlatform';
import { SocialExtractor } from './socialExtractor';
import { RangeTracker } from './rangeTracker';
import { ShadowHighlightOverlay } from './shadowOverlay';
import {
  ContentScriptMessage,
  ContentScriptResponse,
  FindingHighlightTarget,
  ExtractedArticle,
  AnchoredHighlight,
} from './types';

export class ContentScriptController {
  private extractor: ArticleExtractor;
  private rangeTracker: RangeTracker;
  private overlay: ShadowHighlightOverlay | null = null;
  private currentArticle: ExtractedArticle | null = null;
  private currentAnchoredHighlights: AnchoredHighlight[] = [];
  private doc: Document;
  private url: string;
  private socialExtractor: SocialExtractor | null = null;

  /**
   * `url` is injectable so tests can classify a page without a live browser;
   * when omitted it falls back to the hosting window, matching production.
   */
  constructor(doc?: Document, url?: string) {
    this.doc = doc || (typeof document !== 'undefined' ? document : ({} as Document));
    this.url =
      url ??
      (typeof window !== 'undefined' && typeof window.location?.href === 'string'
        ? window.location.href
        : '');
    this.extractor = new ArticleExtractor(this.doc);
    this.rangeTracker = new RangeTracker(this.doc);
  }

  /**
   * Initialize content script and register WebExtension runtime message listeners
   */
  public init(): void {
    if (typeof window === 'undefined') return;

    this.setupRuntimeMessaging();
    this.setupWindowBridge();
  }

  /**
   * Detect and extract the article from the current page. A classified social
   * thread (an X status page) is assembled by the platform thread extractor,
   * which reads the same article shape the rest of the pipeline expects;
   * anything else falls back to the semantic article extractor, or to it when
   * the thread rendered no readable posts.
   */
  public detectAndExtract(): ExtractedArticle {
    let article: ExtractedArticle | null = null;
    if (this.url) {
      const match = detectSocialPlatform(this.hostOf(this.url), this.pathOf(this.url));
      if (match) {
        if (!this.socialExtractor) {
          this.socialExtractor = new SocialExtractor(this.doc, match.platform, this.url);
        }
        article = this.socialExtractor.extract();
      }
    }
    this.currentArticle = article ?? this.extractor.extract();
    return this.currentArticle;
  }

  private hostOf(urlStr: string): string {
    try {
      return new URL(urlStr).host;
    } catch {
      return '';
    }
  }

  private pathOf(urlStr: string): string {
    try {
      return new URL(urlStr).pathname;
    } catch {
      return '';
    }
  }

  /**
   * Apply finding highlights to page inside Shadow DOM overlay
   */
  public applyHighlights(targets: FindingHighlightTarget[]): AnchoredHighlight[] {
    if (!this.currentArticle) {
      this.detectAndExtract();
    }

    if (!this.overlay) {
      this.overlay = new ShadowHighlightOverlay();
      this.overlay.setOnClickCallback((findingId, hl) => {
        this.notifySidepanel({
          type: 'FC_HIGHLIGHT_CLICKED',
          payload: { findingId, highlightId: hl.id, category: hl.target.category },
        });
      });

      this.overlay.setOnHoverCallback((findingId, hl) => {
        if (findingId && hl) {
          this.notifySidepanel({
            type: 'FC_HIGHLIGHT_HOVERED',
            payload: { findingId, highlightId: hl.id },
          });
        }
      });
    }

    const blocks = this.currentArticle ? this.currentArticle.blocks : [];
    this.currentAnchoredHighlights = this.rangeTracker.anchorFindings(targets, blocks);
    this.overlay.setHighlights(this.currentAnchoredHighlights);

    return this.currentAnchoredHighlights;
  }

  /**
   * Clear all active visual highlights
   */
  public clearHighlights(): void {
    if (this.overlay) {
      this.overlay.setHighlights([]);
    }
    this.currentAnchoredHighlights = [];
  }

  /**
   * Scroll viewport to specific finding highlight
   */
  public scrollToHighlight(findingId: string): boolean {
    if (!this.overlay) return false;
    return this.overlay.scrollToHighlight(findingId);
  }

  /**
   * Set active / focused finding from sidepanel interaction
   */
  public setActiveFinding(findingId: string | null): void {
    if (this.overlay) {
      this.overlay.setActiveFinding(findingId);
    }
  }

  /**
   * Set hovered finding from sidepanel interaction
   */
  public setHoveredFinding(findingId: string | null): void {
    if (this.overlay) {
      this.overlay.setHoveredFinding(findingId);
    }
  }

  /**
   * Handle incoming messages from extension background/sidepanel
   */
  public handleMessage(
    message: ContentScriptMessage
  ): ContentScriptResponse<unknown> {
    switch (message.type) {
      case 'FC_PING':
        return { success: true, data: { status: 'ready', url: typeof window !== 'undefined' ? window.location?.href : '' } };

      case 'FC_DETECT_ARTICLE':
      case 'FC_EXTRACT_CONTENT': {
        const article = this.detectAndExtract();
        return { success: true, data: article };
      }

      case 'FC_APPLY_HIGHLIGHTS': {
        const targets = (message.payload as FindingHighlightTarget[]) || [];
        const anchored = this.applyHighlights(targets);
        return { success: true, data: anchored };
      }

      case 'FC_CLEAR_HIGHLIGHTS': {
        this.clearHighlights();
        return { success: true };
      }

      case 'FC_SCROLL_TO_HIGHLIGHT': {
        const payload = message.payload as { findingId: string };
        const scrolled = this.scrollToHighlight(payload.findingId);
        return { success: scrolled };
      }

      case 'FC_HOVER_HIGHLIGHT': {
        const payload = message.payload as { findingId: string | null };
        this.setHoveredFinding(payload.findingId);
        return { success: true };
      }

      case 'FC_UNHOVER_HIGHLIGHT': {
        this.setHoveredFinding(null);
        return { success: true };
      }

      case 'FC_GET_VIEWPORT_HIGHLIGHTS': {
        return {
          success: true,
          data: {
            article: this.currentArticle,
            anchoredHighlights: this.currentAnchoredHighlights,
          },
        };
      }

      default:
        return { success: false, error: `Unknown message type: ${message.type}` };
    }
  }

  /**
   * Notify the sidepanel/background script of user interaction on the page
   */
  private notifySidepanel(msg: ContentScriptMessage): void {
    const runtime = typeof chrome !== 'undefined' ? chrome.runtime : (typeof browser !== 'undefined' ? (browser as any).runtime : null);

    if (runtime && runtime.sendMessage) {
      try {
        runtime.sendMessage(msg);
      } catch {
        // Handle disconnected port / tab
      }
    }

    // Also dispatch as CustomEvent on window for iframe/dev testing
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('FC_CONTENT_SCRIPT_EVENT', {
          detail: msg,
        })
      );
    }
  }

  /**
   * Setup WebExtension runtime listener (Chrome & Firefox MV3 compatible)
   */
  private setupRuntimeMessaging(): void {
    const runtime = typeof chrome !== 'undefined' ? chrome.runtime : (typeof browser !== 'undefined' ? (browser as any).runtime : null);

    if (runtime && runtime.onMessage) {
      runtime.onMessage.addListener(
        (
          message: ContentScriptMessage,
          _sender: any,
          sendResponse: (res: ContentScriptResponse) => void
        ) => {
          const response = this.handleMessage(message);
          sendResponse(response);
          return true; // Keep channel open for async if needed
        }
      );
    }
  }

  /**
   * Setup window bridge for local DOM testing and decoupled harnesses
   */
  private setupWindowBridge(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('message', event => {
      if (event.source !== window || !event.data || !event.data.type) return;
      if (typeof event.data.type === 'string' && event.data.type.startsWith('FC_')) {
        const res = this.handleMessage(event.data);
        if (event.data.requestId) {
          window.postMessage(
            {
              type: 'FC_RESPONSE',
              requestId: event.data.requestId,
              response: res,
            },
            '*'
          );
        }
      }
    });
  }

  public destroy(): void {
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }
  }
}
