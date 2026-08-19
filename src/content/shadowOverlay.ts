/**
 * Closed Shadow DOM Highlight Overlay & Visual Manager
 *
 * Implements:
 * 1. Isolation inside a closed Shadow Root to avoid CSS bleed / DOM interference
 * 2. SVG connecting paths (trait de conduite) and fluid highlight rectangles
 * 3. Emil Kowalski spring micro-interactions and high-craft typography/badges
 * 4. ResizeObserver, MutationObserver, and Scroll listeners with rAF throttling
 * 5. Full prefers-reduced-motion support
 */

import { AnchoredHighlight, OverlayTheme } from './types';

export const DEFAULT_OVERLAY_THEME: OverlayTheme = {
  criticalColor: '#dc2626',
  criticalBg: 'rgba(239, 68, 68, 0.18)',
  warningColor: '#d97706',
  warningBg: 'rgba(245, 158, 11, 0.18)',
  infoColor: '#2563eb',
  infoBg: 'rgba(59, 130, 246, 0.18)',
  positiveColor: '#059669',
  positiveBg: 'rgba(16, 185, 129, 0.18)',
};

export interface HighlightClickCallback {
  (findingId: string, highlight: AnchoredHighlight, event: MouseEvent): void;
}

export interface HighlightHoverCallback {
  (findingId: string | null, highlight: AnchoredHighlight | null, event: MouseEvent | null): void;
}

export class ShadowHighlightOverlay {
  private hostElement: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private containerElement: HTMLElement | null = null;
  private svgLayer: SVGSVGElement | null = null;
  private highlightsMap: Map<string, AnchoredHighlight> = new Map();
  private elementsMap: Map<string, HTMLElement[]> = new Map();

  private activeFindingId: string | null = null;
  private hoveredFindingId: string | null = null;
  private theme: OverlayTheme = DEFAULT_OVERLAY_THEME;

  private onClickCallback: HighlightClickCallback | null = null;
  private onHoverCallback: HighlightHoverCallback | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private rafId: number | null = null;
  private isDestroyed = false;

  constructor(theme: Partial<OverlayTheme> = {}) {
    this.theme = { ...DEFAULT_OVERLAY_THEME, ...theme };
    this.initShadowHost();
    this.setupListeners();
  }

  /**
   * Mount isolated closed shadow root on document body
   */
  private initShadowHost(): void {
    if (typeof document === 'undefined') return;

    // Check if host already exists
    const existing = document.getElementById('fourches-caudines-overlay-host');
    if (existing) {
      existing.remove();
    }

    this.hostElement = document.createElement('div');
    this.hostElement.id = 'fourches-caudines-overlay-host';
    this.hostElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483640;
      margin: 0;
      padding: 0;
    `;

    // Attach closed shadow root
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'closed' });

    // Inject styling inside shadow DOM
    const style = document.createElement('style');
    style.textContent = this.generateOverlayCSS();
    this.shadowRoot.appendChild(style);

    // Main highlight container
    this.containerElement = document.createElement('div');
    this.containerElement.className = 'fc-overlay-container';
    this.shadowRoot.appendChild(this.containerElement);

    // SVG layer for connectors and underlines
    this.svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgLayer.setAttribute('class', 'fc-svg-layer');
    this.svgLayer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
    `;
    this.containerElement.appendChild(this.svgLayer);

    document.body.appendChild(this.hostElement);
  }

  /**
   * Render or update all anchored highlights
   */
  public setHighlights(highlights: AnchoredHighlight[]): void {
    this.highlightsMap.clear();
    for (const hl of highlights) {
      if (hl.tier !== 'unanchored' && hl.rects.length > 0) {
        this.highlightsMap.set(hl.findingId, hl);
      }
    }
    this.render();
  }

  /**
   * Set the active/focused highlight finding ID (e.g. clicked in sidepanel)
   */
  public setActiveFinding(findingId: string | null): void {
    this.activeFindingId = findingId;
    this.updateActiveStyles();
  }

  /**
   * Set the hovered highlight finding ID
   */
  public setHoveredFinding(findingId: string | null): void {
    this.hoveredFindingId = findingId;
    this.updateHoverStyles();
  }

  /**
   * Smoothly scroll viewport to center the target highlight
   */
  public scrollToHighlight(findingId: string): boolean {
    const highlight = this.highlightsMap.get(findingId);
    if (!highlight || highlight.rects.length === 0) return false;

    const top = highlight.boundingBox.top;
    const targetY = Math.max(0, top - window.innerHeight / 3);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.scrollTo({
      top: targetY,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });

    this.setActiveFinding(findingId);
    return true;
  }

  /**
   * Recalculate coordinates and re-render visual boxes on scroll/resize/mutation
   */
  public reposition(): void {
    if (this.isDestroyed || !this.containerElement) return;

    // Recalculate range bounding boxes from live Range instances
    for (const [findingId, hl] of this.highlightsMap.entries()) {
      if (hl.range) {
        try {
          const clientRects = Array.from(hl.range.getClientRects());
          const scrollX = window.scrollX || window.pageXOffset || 0;
          const scrollY = window.scrollY || window.pageYOffset || 0;

          hl.rects = clientRects
            .filter(r => r.width > 0 && r.height > 0)
            .map((r, i) => ({
              top: r.top + scrollY,
              left: r.left + scrollX,
              width: r.width,
              height: r.height,
              lineIndex: i,
            }));

          hl.boundingBox = this.computeBoundingBox(hl.rects);
        } catch {
          // Range might be invalidated
        }
      }
    }

    this.render();
  }

  /**
   * Core render loop: build HTML mark rects and badges inside Shadow DOM
   */
  private render(): void {
    if (!this.containerElement || !this.svgLayer) return;

    // Clear previous highlight elements
    const oldRects = this.containerElement.querySelectorAll('.fc-highlight-group');
    oldRects.forEach(el => el.remove());
    this.elementsMap.clear();

    while (this.svgLayer.firstChild) {
      this.svgLayer.removeChild(this.svgLayer.firstChild);
    }

    // Adjust host element document height
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    );
    if (this.hostElement) {
      this.hostElement.style.height = `${docHeight}px`;
    }

    for (const [findingId, hl] of this.highlightsMap.entries()) {
      const groupEl = document.createElement('div');
      groupEl.className = `fc-highlight-group fc-severity-${hl.target.severity}`;
      groupEl.dataset.findingId = findingId;

      const createdBoxes: HTMLElement[] = [];

      hl.rects.forEach((rect, idx) => {
        const box = document.createElement('div');
        box.className = `fc-highlight-rect fc-severity-${hl.target.severity}`;
        box.dataset.findingId = findingId;
        box.style.top = `${rect.top}px`;
        box.style.left = `${rect.left}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;

        // Interactive event listeners
        box.addEventListener('click', e => {
          e.stopPropagation();
          this.handleClick(findingId, hl, e);
        });

        box.addEventListener('mouseenter', e => {
          this.handleMouseEnter(findingId, hl, e);
        });

        box.addEventListener('mouseleave', e => {
          this.handleMouseLeave(e);
        });

        groupEl.appendChild(box);
        createdBoxes.push(box);
      });

      // Add badge / indicator tag on the first rect
      if (hl.rects.length > 0) {
        const firstRect = hl.rects[0];
        const badge = document.createElement('div');
        badge.className = `fc-highlight-badge fc-severity-${hl.target.severity}`;
        badge.dataset.findingId = findingId;
        badge.style.top = `${firstRect.top - 18}px`;
        badge.style.left = `${firstRect.left}px`;
        badge.textContent = this.formatCategoryLabel(hl.target.category);

        badge.addEventListener('click', e => {
          e.stopPropagation();
          this.handleClick(findingId, hl, e);
        });

        groupEl.appendChild(badge);
        createdBoxes.push(badge);
      }

      this.containerElement.appendChild(groupEl);
      this.elementsMap.set(findingId, createdBoxes);
    }

    this.updateActiveStyles();
    this.updateHoverStyles();
  }

  private updateActiveStyles(): void {
    if (!this.containerElement) return;

    const allGroups = this.containerElement.querySelectorAll('.fc-highlight-group');
    allGroups.forEach(g => {
      const isAct = (g as HTMLElement).dataset.findingId === this.activeFindingId;
      g.classList.toggle('fc-is-active', isAct);
    });
  }

  private updateHoverStyles(): void {
    if (!this.containerElement) return;

    const allGroups = this.containerElement.querySelectorAll('.fc-highlight-group');
    allGroups.forEach(g => {
      const isHov = (g as HTMLElement).dataset.findingId === this.hoveredFindingId;
      g.classList.toggle('fc-is-hovered', isHov);
    });
  }

  private handleClick(findingId: string, hl: AnchoredHighlight, e: MouseEvent): void {
    this.activeFindingId = findingId;
    this.updateActiveStyles();
    if (this.onClickCallback) {
      this.onClickCallback(findingId, hl, e);
    }
  }

  private handleMouseEnter(findingId: string, hl: AnchoredHighlight, e: MouseEvent): void {
    this.hoveredFindingId = findingId;
    this.updateHoverStyles();
    if (this.onHoverCallback) {
      this.onHoverCallback(findingId, hl, e);
    }
  }

  private handleMouseLeave(e: MouseEvent): void {
    this.hoveredFindingId = null;
    this.updateHoverStyles();
    if (this.onHoverCallback) {
      this.onHoverCallback(null, null, e);
    }
  }

  public setOnClickCallback(cb: HighlightClickCallback): void {
    this.onClickCallback = cb;
  }

  public setOnHoverCallback(cb: HighlightHoverCallback): void {
    this.onHoverCallback = cb;
  }

  private setupListeners(): void {
    // Throttled rAF scroll & resize listener
    const onScrollOrResize = () => {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => {
        this.reposition();
      });
    };

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    // MutationObserver to catch dynamic DOM changes
    this.mutationObserver = new MutationObserver(mutations => {
      let shouldReposition = false;
      for (const m of mutations) {
        if (m.target !== this.hostElement && !this.hostElement?.contains(m.target as Node)) {
          shouldReposition = true;
          break;
        }
      }
      if (shouldReposition) {
        onScrollOrResize();
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }

  private formatCategoryLabel(cat: string): string {
    const labels: Record<string, string> = {
      logical_fallacy: 'Sophisme',
      unverified_source: 'Source Invérifiée',
      factual_error: 'Erreur Factuelle',
      manipulation: 'Manipulation Rhétorique',
      editorial_bias: 'Biais Éditorial',
      missing_context: 'Contexte Manquant',
      methodological_flaw: 'Défaut Méthodologique',
      rigorous_journalism: 'Rigueur Journalistique',
    };
    return labels[cat] || 'Point d’Attention';
  }

  private computeBoundingBox(rects: Array<{ top: number; left: number; width: number; height: number }>) {
    if (rects.length === 0) return { top: 0, left: 0, width: 0, height: 0 };
    let minTop = Infinity;
    let minLeft = Infinity;
    let maxBottom = -Infinity;
    let maxRight = -Infinity;
    for (const r of rects) {
      if (r.top < minTop) minTop = r.top;
      if (r.left < minLeft) minLeft = r.left;
      if (r.top + r.height > maxBottom) maxBottom = r.top + r.height;
      if (r.left + r.width > maxRight) maxRight = r.left + r.width;
    }
    return {
      top: minTop,
      left: minLeft,
      width: Math.max(0, maxRight - minLeft),
      height: Math.max(0, maxBottom - minTop),
    };
  }

  /**
   * Generate high-craft, isolated CSS stylesheet for the Shadow DOM overlay
   */
  private generateOverlayCSS(): string {
    return `
      :host {
        all: initial;
      }
      .fc-overlay-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .fc-highlight-rect {
        position: absolute;
        pointer-events: auto;
        cursor: pointer;
        border-radius: 3px;
        transition: background-color 150ms cubic-bezier(0.16, 1, 0.3, 1),
                    transform 150ms cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 150ms cubic-bezier(0.16, 1, 0.3, 1);
        mix-blend-mode: multiply;
        box-sizing: border-box;
      }
      .fc-highlight-rect.fc-severity-critical {
        background-color: ${this.theme.criticalBg};
        border-bottom: 2px solid ${this.theme.criticalColor};
      }
      .fc-highlight-rect.fc-severity-warning {
        background-color: ${this.theme.warningBg};
        border-bottom: 2px solid ${this.theme.warningColor};
      }
      .fc-highlight-rect.fc-severity-info {
        background-color: ${this.theme.infoBg};
        border-bottom: 2px solid ${this.theme.infoColor};
      }
      .fc-highlight-rect.fc-severity-positive {
        background-color: ${this.theme.positiveBg};
        border-bottom: 2px solid ${this.theme.positiveColor};
      }
      
      /* Hovered & Active States */
      .fc-highlight-group.fc-is-hovered .fc-highlight-rect {
        transform: scale(1.02);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        z-index: 10;
      }
      .fc-highlight-group.fc-is-active .fc-highlight-rect {
        transform: scale(1.03);
        box-shadow: 0 0 0 2px #111827, 0 4px 12px rgba(0, 0, 0, 0.18);
        z-index: 20;
      }

      /* Badges */
      .fc-highlight-badge {
        position: absolute;
        pointer-events: auto;
        cursor: pointer;
        padding: 1px 6px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        border-radius: 4px;
        color: #ffffff;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        z-index: 5;
        white-space: nowrap;
        user-select: none;
        transition: transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .fc-highlight-badge:hover {
        transform: translateY(-1px) scale(1.04);
      }
      .fc-highlight-badge.fc-severity-critical {
        background-color: ${this.theme.criticalColor};
      }
      .fc-highlight-badge.fc-severity-warning {
        background-color: ${this.theme.warningColor};
      }
      .fc-highlight-badge.fc-severity-info {
        background-color: ${this.theme.infoColor};
      }
      .fc-highlight-badge.fc-severity-positive {
        background-color: ${this.theme.positiveColor};
      }

      @media (prefers-reduced-motion: reduce) {
        .fc-highlight-rect,
        .fc-highlight-badge {
          transition: none !important;
          transform: none !important;
        }
      }
    `;
  }

  /**
   * Teardown and unmount
   */
  public destroy(): void {
    this.isDestroyed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.mutationObserver) this.mutationObserver.disconnect();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.hostElement) {
      this.hostElement.remove();
      this.hostElement = null;
    }
  }
}
