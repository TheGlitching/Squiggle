/**
 * The demo must paint with the extension's own severity logic and palette. If
 * this mapping drifts from `src/adapters/findingAdapters.ts`, the landing shows
 * a colour the extension would never show.
 */
import { describe, expect, it } from 'vitest';

import {
  EXAMPLES,
  SEVERITY_COLORS,
  severityColor,
  severityToHighlightSeverity,
} from '../src/demo';

describe('severityToHighlightSeverity', () => {
  it('always reads a strength as positive', () => {
    expect(severityToHighlightSeverity(3, 'point-fort')).toBe('positive');
  });

  it('caps a non-sourced or verified finding at info', () => {
    expect(severityToHighlightSeverity(3, 'sophisme', 'non-sourcee')).toBe('info');
    expect(severityToHighlightSeverity(3, 'sophisme', 'verifiee')).toBe('info');
  });

  it('maps the remaining severity levels', () => {
    expect(severityToHighlightSeverity(3, 'sophisme', 'douteuse')).toBe('critical');
    expect(severityToHighlightSeverity(3, 'sophisme', 'non-verifiable')).toBe('warning');
    expect(severityToHighlightSeverity(2, 'cadrage')).toBe('warning');
    expect(severityToHighlightSeverity(1, 'surinterpretation')).toBe('info');
  });
});

describe('example -> severity -> colour', () => {
  const byCategory = Object.fromEntries(EXAMPLES.map((example) => [example.cat, example]));

  it('resolves each of the five examples to its shipped colour', () => {
    expect(byCategory['Robustesse factuelle'].sev).toBe('info');
    expect(byCategory['Solidité logique'].sev).toBe('critical');
    expect(byCategory['Cadrage et rhétorique'].sev).toBe('warning');
    expect(byCategory['Déontologie'].sev).toBe('warning');
    expect(byCategory['Soin de la langue'].sev).toBe('info');
  });

  it('points each severity at the extension palette entry', () => {
    expect(severityColor(byCategory['Solidité logique'].sev)).toBe(SEVERITY_COLORS.critical);
    expect(severityColor(byCategory['Déontologie'].sev)).toBe(SEVERITY_COLORS.warning);
    expect(severityColor(byCategory['Robustesse factuelle'].sev)).toBe(SEVERITY_COLORS.info);
  });
});
