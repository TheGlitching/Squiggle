/**
 * Editorial Canvas Rendering Engine
 * High-resolution 2x Retina rendering for editorial review scorecards
 */

import { EditorialCardData, CanvasExportOptions, ScoreBand } from './types';

interface ThemePalette {
  bg: string;
  bgTextureTint: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderSubtle: string;
  borderHeavy: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentSubtle: string;
  // Score band colors
  band: {
    primary: string;
    border: string;
    bg: string;
    text: string;
  };
  // Score bands
  scoreSolide: string;
  scorePerfectible: string;
  scoreFragile: string;
  scoreProblematique: string;
  // Category tags
  categories: Record<string, string>;
  severities: Record<string, string>;
}

const SCORE_BAND_THEMES: Record<ScoreBand, {
  label: string;
  sublabel: string;
  latinMotto: string;
  colorLight: { primary: string; border: string; bg: string; text: string };
  colorDark: { primary: string; border: string; bg: string; text: string };
}> = {
  solide: {
    label: 'SOLIDE',
    sublabel: 'ARTICLE FIABLE',
    latinMotto: 'VERITAS ET RIGOR',
    colorLight: { primary: '#1B4D3E', border: '#1B4D3E', bg: 'rgba(27, 77, 62, 0.08)', text: '#14382D' },
    colorDark: { primary: '#34D399', border: '#34D399', bg: 'rgba(52, 211, 153, 0.12)', text: '#A7F3D0' },
  },
  perfectible: {
    label: 'PERFECTIBLE',
    sublabel: 'RÉSERVES MINEURES',
    latinMotto: 'CAUTELA NECESSARIA',
    colorLight: { primary: '#854D0E', border: '#854D0E', bg: 'rgba(133, 77, 14, 0.08)', text: '#713F12' },
    colorDark: { primary: '#FBBF24', border: '#FBBF24', bg: 'rgba(251, 191, 36, 0.12)', text: '#FDE68A' },
  },
  fragile: {
    label: 'FRAGILE',
    sublabel: 'FAIBLESSES NOTABLES',
    latinMotto: 'AUDIATUR ET ALTERA PARS',
    colorLight: { primary: '#C2410C', border: '#C2410C', bg: 'rgba(194, 65, 12, 0.08)', text: '#9A3412' },
    colorDark: { primary: '#FB923C', border: '#FB923C', bg: 'rgba(251, 146, 60, 0.12)', text: '#FED7AA' },
  },
  problematique: {
    label: 'PROBLÉMATIQUE',
    sublabel: 'À LIRE AVEC PRUDENCE',
    latinMotto: 'NIHIL PROBATUR',
    colorLight: { primary: '#881337', border: '#881337', bg: 'rgba(136, 19, 55, 0.08)', text: '#701A75' },
    colorDark: { primary: '#F43F5E', border: '#F43F5E', bg: 'rgba(244, 63, 94, 0.12)', text: '#FECDD3' },
  },
};

function getPalette(theme: 'light' | 'dark', scoreBand: ScoreBand): ThemePalette {
  const isDark = theme === 'dark';
  const bandTheme = isDark ? SCORE_BAND_THEMES[scoreBand].colorDark : SCORE_BAND_THEMES[scoreBand].colorLight;

  if (isDark) {
    return {
      bg: '#141416',
      bgTextureTint: '#1B1B1E',
      surface: '#1C1D21',
      surfaceMuted: '#24252B',
      border: '#32343E',
      borderSubtle: '#23252E',
      borderHeavy: '#4E505E',
      text: '#F3F4F6',
      textMuted: '#9CA3AF',
      textFaint: '#6B7280',
      accent: '#E05338',
      accentSubtle: 'rgba(224, 83, 56, 0.15)',
      band: bandTheme,
      scoreSolide: '#34D399',
      scorePerfectible: '#60A5FA',
      scoreFragile: '#FBBF24',
      scoreProblematique: '#F87171',
      categories: {
        sophisme: '#F43F5E',
        unsupported: '#FB923C',
        overreach: '#FBBF24',
        sourceAbsent: '#A855F7',
        framing: '#38BDF8',
        strength: '#34D399',
      },
      severities: {
        critical: '#F43F5E',
        major: '#FB923C',
        minor: '#FBBF24',
        info: '#60A5FA',
      },
    };
  }

  return {
    bg: '#FDFBF7',
    bgTextureTint: '#F4EFE6',
    surface: '#FFFFFF',
    surfaceMuted: '#F6F3EC',
    border: '#DED6C7',
    borderSubtle: '#EDE7DC',
    borderHeavy: '#1C1917',
    text: '#1C1917',
    textMuted: '#57534E',
    textFaint: '#8C857B',
    accent: '#B91C1C',
    accentSubtle: 'rgba(185, 28, 28, 0.08)',
    band: bandTheme,
    scoreSolide: '#15803D',
    scorePerfectible: '#0369A1',
    scoreFragile: '#B45309',
    scoreProblematique: '#BE123C',
    categories: {
      sophisme: '#BE123C',
      unsupported: '#C2410C',
      overreach: '#B45309',
      sourceAbsent: '#7E22CE',
      framing: '#0284C7',
      strength: '#15803D',
    },
    severities: {
      critical: '#BE123C',
      major: '#C2410C',
      minor: '#B45309',
      info: '#0284C7',
    },
  };
}

export class EditorialCanvasRenderer {
  private width: number;
  private height: number;
  private pixelRatio: number;
  private theme: 'light' | 'dark';
  private fontHeading: string;
  private fontBody: string;
  private fontMono: string;

  constructor(options: CanvasExportOptions = {}) {
    this.width = options.width || 840;
    this.height = options.height || 1120;
    this.pixelRatio = options.pixelRatio || 2;
    this.theme = options.theme || 'light';
    this.fontHeading = options.fontFamilyHeading || '"Playfair Display", "Cinzel", "Georgia", serif';
    this.fontBody = options.fontFamilyBody || '"Inter", "-apple-system", "Helvetica Neue", sans-serif';
    this.fontMono = options.fontFamilyMono || '"JetBrains Mono", "Courier New", monospace';
  }

  /**
   * Helper: draw rounded rectangle
   */
  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Helper: word wrapping for Canvas text
   */
  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  /**
   * Render complete Editorial Review Card onto the provided HTML5 Canvas
   */
  public render(canvas: HTMLCanvasElement, data: EditorialCardData): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to obtain 2D rendering context from canvas');
    }

    const pr = this.pixelRatio;
    const w = this.width;
    const h = this.height;

    // Set physical backing size for retina crispness
    canvas.width = w * pr;
    canvas.height = h * pr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    // Scale drawing context so logical coordinates match w & h
    ctx.setTransform(pr, 0, 0, pr, 0, 0);

    const palette = getPalette(this.theme, data.scoreBand);
    const bandInfo = SCORE_BAND_THEMES[data.scoreBand];

    // 1. Background with editorial paper texture feel
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle paper noise / ruled borders
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    ctx.strokeStyle = palette.borderHeavy;
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, w - 48, h - 48);

    // Header Masthead
    this.renderMasthead(ctx, w, palette, data);

    // Article Title & Metadata
    const contentStartY = 145;
    const nextY = this.renderArticleMeta(ctx, 40, contentStartY, w - 80, palette, data);

    // Middle Split: Score Gauge / Score Band Badge vs Domain Breakdown
    const splitY = nextY + 15;
    const midSectionHeight = 270;
    this.renderScoresAndBandSection(ctx, 40, splitY, w - 80, midSectionHeight, palette, data, bandInfo);

    // Key Findings & Editorial Summary Section
    const findingsY = splitY + midSectionHeight + 20;
    const findingsHeight = h - findingsY - 60;
    this.renderKeyFindingsSection(ctx, 40, findingsY, w - 80, findingsHeight, palette, data);

    // Footer Branding & Watermark
    this.renderFooter(ctx, 40, h - 50, w - 80, palette, data);
  }

  /**
   * 1. Header Masthead / Newspaper Press Banner
   */
  private renderMasthead(
    ctx: CanvasRenderingContext2D,
    w: number,
    palette: ThemePalette,
    data: EditorialCardData
  ): void {
    const appName = data.branding?.appName || 'SQUIGGLE';
    const tagline = data.branding?.tagline || 'REVUE ÉDITORIALE & AUDIT CRITIQUE';
    const edition = data.branding?.edition || 'FICHE D’ÉVALUATION MÉTHODOLOGIQUE';

    // Top decorative bar
    ctx.fillStyle = palette.accent;
    ctx.fillRect(30, 32, w - 60, 3);

    // Masthead App Title
    ctx.fillStyle = palette.text;
    ctx.font = `900 24px ${this.fontHeading}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(appName.toUpperCase(), w / 2, 54);

    // Tagline & Edition
    ctx.fillStyle = palette.textMuted;
    ctx.font = `600 10px ${this.fontMono}`;
    ctx.fillText(`${tagline} — ${edition}`.toUpperCase(), w / 2, 74);

    // Double rule line beneath masthead
    ctx.strokeStyle = palette.borderHeavy;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(30, 88);
    ctx.lineTo(w - 30, 88);
    ctx.stroke();

    ctx.strokeStyle = palette.borderSubtle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 92);
    ctx.lineTo(w - 30, 92);
    ctx.stroke();
  }

  /**
   * 2. Article Title & Metadata
   */
  private renderArticleMeta(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    maxWidth: number,
    palette: ThemePalette,
    data: EditorialCardData
  ): number {
    let curY = y;

    // Date & Reviewer line
    const metaDate = data.reviewDate || new Date().toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const reviewer = data.reviewer ? ` • ÉVALUATEUR: ${data.reviewer.toUpperCase()}` : '';
    ctx.fillStyle = palette.accent;
    ctx.font = `700 11px ${this.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`PARIS, LE ${metaDate.toUpperCase()}${reviewer}`, x, curY);

    curY += 20;

    // Article Title (Wrapped)
    ctx.fillStyle = palette.text;
    ctx.font = `bold 22px ${this.fontHeading}`;
    const lines = this.wrapText(ctx, `« ${data.title} »`, maxWidth);
    const maxTitleLines = 3;
    const displayedLines = lines.slice(0, maxTitleLines);
    if (lines.length > maxTitleLines) {
      displayedLines[maxTitleLines - 1] += '...';
    }

    for (const line of displayedLines) {
      ctx.fillText(line, x, curY);
      curY += 28;
    }

    // Source URL if present
    if (data.url) {
      curY += 4;
      ctx.fillStyle = palette.textFaint;
      ctx.font = `11px ${this.fontMono}`;
      const urlText = data.url.length > 80 ? data.url.substring(0, 77) + '...' : data.url;
      ctx.fillText(`Source : ${urlText}`, x, curY);
      curY += 16;
    }

    return curY;
  }

  /**
   * 3. Score Gauges & Score Band Section
   */
  private renderScoresAndBandSection(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    palette: ThemePalette,
    data: EditorialCardData,
    bandInfo: (typeof SCORE_BAND_THEMES)[ScoreBand]
  ): void {
    // Card container
    ctx.fillStyle = palette.surface;
    this.drawRoundedRect(ctx, x, y, width, height, 6);
    ctx.fill();

    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    const colWidth = (width - 30) / 2;

    // Left Column: Composite Score & Score Band Badge
    this.renderCompositeScoreAndBand(ctx, x + 15, y + 15, colWidth, height - 30, palette, data, bandInfo);

    // Vertical Divider
    ctx.strokeStyle = palette.borderSubtle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + colWidth + 15, y + 15);
    ctx.lineTo(x + colWidth + 15, y + height - 15);
    ctx.stroke();

    // Right Column: Domain Score Meters
    this.renderDomainMeters(ctx, x + colWidth + 30, y + 15, colWidth - 15, height - 30, palette, data);
  }

  /**
   * 3a. Composite Score Gauge Arc & Score Band Badge
   */
  private renderCompositeScoreAndBand(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    _height: number,
    palette: ThemePalette,
    data: EditorialCardData,
    bandInfo: (typeof SCORE_BAND_THEMES)[ScoreBand]
  ): void {
    const centerX = x + width / 2;
    const gaugeCenterY = y + 70;
    const radius = 52;
    const strokeWidth = 10;

    // Reliability Arc Gauge (270 degrees arc)
    const startAngle = 0.75 * Math.PI;
    const totalAngle = 1.5 * Math.PI;
    const clampedScore = Math.max(0, Math.min(100, data.reliabilityScore));
    const scoreAngle = startAngle + (clampedScore / 100) * totalAngle;

    // Gauge track background
    ctx.beginPath();
    ctx.arc(centerX, gaugeCenterY, radius, startAngle, startAngle + totalAngle, false);
    ctx.strokeStyle = palette.surfaceMuted;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Determine color based on score
    let scoreColor = palette.scoreProblematique;
    if (clampedScore >= 80) scoreColor = palette.scoreSolide;
    else if (clampedScore >= 65) scoreColor = palette.scorePerfectible;
    else if (clampedScore >= 45) scoreColor = palette.scoreFragile;

    // Gauge active progress arc
    if (clampedScore > 0) {
      ctx.beginPath();
      ctx.arc(centerX, gaugeCenterY, radius, startAngle, scoreAngle, false);
      ctx.strokeStyle = scoreColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Score Value in Center
    ctx.fillStyle = palette.text;
    ctx.font = `bold 32px ${this.fontHeading}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(clampedScore)}`, centerX, gaugeCenterY - 4);

    ctx.fillStyle = palette.textMuted;
    ctx.font = `600 11px ${this.fontMono}`;
    ctx.fillText('/ 100', centerX, gaugeCenterY + 20);

    ctx.font = `700 9px ${this.fontMono}`;
    ctx.fillText('INDICE DE FIABILITÉ', centerX, gaugeCenterY + 45);

    // Score Band Badge (flat labeled panel describing the qualitative band)
    const badgeY = y + 150;
    const badgeW = width - 40;
    const badgeH = 75;
    const badgeX = x + 20;

    ctx.save();

    // Badge background tint
    ctx.fillStyle = palette.band.bg;
    this.drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = palette.band.border;
    ctx.lineWidth = 2;
    this.drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
    ctx.stroke();

    const badgeCenterX = badgeX + badgeW / 2;

    // Band label
    ctx.fillStyle = palette.band.primary;
    ctx.font = `900 20px ${this.fontHeading}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bandInfo.label, badgeCenterX, badgeY + badgeH / 2 - 14);

    // Sublabel & Latin Motto
    ctx.font = `700 10px ${this.fontMono}`;
    ctx.fillText(bandInfo.sublabel, badgeCenterX, badgeY + badgeH / 2 + 8);

    ctx.font = `italic 600 9px ${this.fontHeading}`;
    ctx.fillStyle = palette.band.text;
    ctx.fillText(`« ${bandInfo.latinMotto} »`, badgeCenterX, badgeY + badgeH / 2 + 24);

    ctx.restore();
  }

  /**
   * 3b. Domain Score Linear Meters
   */
  private renderDomainMeters(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    palette: ThemePalette,
    data: EditorialCardData
  ): void {
    ctx.fillStyle = palette.text;
    ctx.font = `bold 12px ${this.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ANALYSE PAR DOMAINE ÉDITORIAL', x, y);

    const domains = data.domainScores.length > 0
      ? data.domainScores
      : [
          { id: 'sources', name: 'Sources & Citations', score: 75 },
          { id: 'logic', name: 'Raisonnement & Logique', score: 60 },
          { id: 'framing', name: 'Cadrage & Neutralité', score: 85 },
          { id: 'facts', name: 'Exactitude Factuelle', score: 70 },
          { id: 'clarity', name: 'Clarté & Précision', score: 90 },
        ];

    const availableHeight = height - 30;
    const rowHeight = Math.min(42, availableHeight / domains.length);
    let curY = y + 25;

    for (const domain of domains.slice(0, 5)) {
      // Domain label
      ctx.fillStyle = palette.text;
      ctx.font = `600 11px ${this.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(domain.name, x, curY);

      // Score Value
      ctx.font = `700 11px ${this.fontMono}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = palette.text;
      ctx.fillText(`${Math.round(domain.score)}%`, x + width, curY);

      // Progress Bar Track
      const barY = curY + 16;
      const barHeight = 7;
      ctx.fillStyle = palette.surfaceMuted;
      this.drawRoundedRect(ctx, x, barY, width, barHeight, 3);
      ctx.fill();

      // Progress Bar Active Fill
      let fillCol = palette.scoreProblematique;
      if (domain.score >= 80) fillCol = palette.scoreSolide;
      else if (domain.score >= 65) fillCol = palette.scorePerfectible;
      else if (domain.score >= 45) fillCol = palette.scoreFragile;

      const fillW = Math.max(6, (domain.score / 100) * width);
      ctx.fillStyle = fillCol;
      this.drawRoundedRect(ctx, x, barY, fillW, barHeight, 3);
      ctx.fill();

      curY += rowHeight;
    }
  }

  /**
   * 4. Key Findings & Synthesis Section
   */
  private renderKeyFindingsSection(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    palette: ThemePalette,
    data: EditorialCardData
  ): void {
    // Outer section container
    ctx.fillStyle = palette.surface;
    this.drawRoundedRect(ctx, x, y, width, height, 6);
    ctx.fill();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Section Header
    ctx.fillStyle = palette.surfaceMuted;
    ctx.fillRect(x + 1, y + 1, width - 2, 34);

    ctx.fillStyle = palette.text;
    ctx.font = `bold 12px ${this.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('OBSERVATIONS CRITIQUES & POINTS DE VIGILANCE', x + 15, y + 18);

    const findingsCount = data.keyFindings.length;
    ctx.textAlign = 'right';
    ctx.fillStyle = palette.accent;
    ctx.fillText(`${findingsCount} CONSTAT${findingsCount > 1 ? 'S' : ''}`, x + width - 15, y + 18);

    // List of Findings
    let curY = y + 45;
    const maxFindings = 4;
    const findingsToShow = data.keyFindings.slice(0, maxFindings);

    if (findingsToShow.length === 0) {
      ctx.fillStyle = palette.textMuted;
      ctx.font = `italic 12px ${this.fontBody}`;
      ctx.textAlign = 'center';
      ctx.fillText('Aucune anomalie critique relevée lors de l’examen.', x + width / 2, curY + 40);
      return;
    }

    for (let i = 0; i < findingsToShow.length; i++) {
      const finding = findingsToShow[i];
      const catColor = palette.categories[finding.category] || palette.accent;
      const sevColor = palette.severities[finding.severity] || palette.textMuted;

      // Severity left stripe
      ctx.fillStyle = sevColor;
      ctx.fillRect(x + 12, curY, 4, finding.excerpt ? 48 : 30);

      // Category Pill / Tag
      const catLabel = finding.category.toUpperCase();
      ctx.font = `bold 9px ${this.fontMono}`;
      const catWidth = ctx.measureText(catLabel).width + 12;

      ctx.fillStyle = palette.surfaceMuted;
      this.drawRoundedRect(ctx, x + 24, curY - 2, catWidth, 16, 3);
      ctx.fill();
      ctx.strokeStyle = catColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = catColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(catLabel, x + 30, curY + 6);

      // Finding Title
      ctx.fillStyle = palette.text;
      ctx.font = `600 12px ${this.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const titleX = x + 32 + catWidth;
      const maxTitleW = width - (titleX - x) - 20;
      let titleText = finding.title;
      if (ctx.measureText(titleText).width > maxTitleW) {
        while (titleText.length > 0 && ctx.measureText(titleText + '...').width > maxTitleW) {
          titleText = titleText.substring(0, titleText.length - 1);
        }
        titleText += '...';
      }
      ctx.fillText(titleText, titleX, curY + 6);

      // Excerpt if available
      if (finding.excerpt) {
        ctx.fillStyle = palette.textMuted;
        ctx.font = `italic 11px ${this.fontHeading}`;
        const excerptLines = this.wrapText(ctx, `« ${finding.excerpt} »`, width - 50);
        if (excerptLines[0]) {
          ctx.fillText(excerptLines[0], x + 24, curY + 28);
        }
        curY += 56;
      } else {
        curY += 36;
      }

      // Divider line between items
      if (i < findingsToShow.length - 1) {
        ctx.strokeStyle = palette.borderSubtle;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + 20, curY - 4);
        ctx.lineTo(x + width - 20, curY - 4);
        ctx.stroke();
      }
    }

    // Optional editorial synthesis text at the bottom of findings if space permits
    if (data.summaryText && curY < y + height - 40) {
      ctx.fillStyle = palette.surfaceMuted;
      this.drawRoundedRect(ctx, x + 12, curY + 5, width - 24, y + height - curY - 15, 4);
      ctx.fill();

      ctx.fillStyle = palette.textMuted;
      ctx.font = `italic 11px ${this.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const summaryLines = this.wrapText(ctx, `Synthèse : ${data.summaryText}`, width - 44);
      let sY = curY + 12;
      for (const line of summaryLines.slice(0, 2)) {
        ctx.fillText(line, x + 22, sY);
        sY += 16;
      }
    }
  }

  /**
   * 5. Footer Signature & Security Watermark
   */
  private renderFooter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    palette: ThemePalette,
    data: EditorialCardData
  ): void {
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();

    // Brand Watermark
    ctx.fillStyle = palette.textFaint;
    ctx.font = `600 9px ${this.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SQUIGGLE • MÉTHODE DES FOURCHES CAUDINES', x, y + 18);

    // Cryptographic / Review Stamp ID
    const hash = Math.abs(
      (data.title + (data.reviewDate || '')).split('').reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0)
    ).toString(16).toUpperCase().padStart(8, '0');

    ctx.textAlign = 'right';
    ctx.fillText(`SCEAU NUMÉRIQUE : FC-${hash}`, x + width, y + 18);
  }

  /**
   * Export Canvas to PNG Blob
   */
  public static async toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas export to Blob failed'));
        }
      }, 'image/png');
    });
  }

  /**
   * One-click download as PNG file
   */
  public static async downloadPng(canvas: HTMLCanvasElement, filename = 'squiggle-review.png'): Promise<void> {
    const blob = await this.toBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.body.appendChild(document.createElement('a'));
    a.href = url;
    a.download = filename;
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Copy Canvas image to system clipboard as image/png
   */
  public static async copyToClipboard(canvas: HTMLCanvasElement): Promise<void> {
    const blob = await this.toBlob(canvas);
    if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function') {
      throw new Error('Clipboard image writing not supported by browser');
    }
    const item = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([item]);
  }
}
