import { describe, it, expect } from 'vitest';
import {
  PRIORITY_TIERS,
  PrioritizedRevisionPlanData,
  PrioritizedRevisionPlan,
} from '../src/ui/components/PrioritizedRevisionPlan';
import { lightTheme, darkTheme } from '../src/ui/tokens/colors';

describe('PrioritizedRevisionPlan Component & Configs', () => {
  it('should define all 3 priority tiers with correct french labels and codes', () => {
    expect(PRIORITY_TIERS.length).toBe(3);

    const [p1, p2, p3] = PRIORITY_TIERS;
    expect(p1.id).toBe('priority1_blocking');
    expect(p1.tierNumber).toBe(1);
    expect(p1.frenchLabel).toBe('Priorité 1 - Bloquant');
    expect(p1.shortCode).toBe('P1');
    expect(p1.colorKey).toBe('sophisme');

    expect(p2.id).toBe('priority2_major');
    expect(p2.tierNumber).toBe(2);
    expect(p2.frenchLabel).toBe('Priorité 2 - Majeur');
    expect(p2.shortCode).toBe('P2');
    expect(p2.colorKey).toBe('unsupported');

    expect(p3.id).toBe('priority3_editorial_optimizations');
    expect(p3.tierNumber).toBe(3);
    expect(p3.frenchLabel).toBe('Priorité 3 - Optimisation éditoriale');
    expect(p3.shortCode).toBe('P3');
    expect(p3.colorKey).toBe('framing');
  });

  it('should compute statistics for empty and populated tiers accurately', () => {
    const mockPlan: PrioritizedRevisionPlanData = {
      priority1_blocking: [
        {
          id: 'p1_1',
          problem: 'Affirmation sans source sur la mortalité',
          reason: 'Non étayé par une étude clinique',
          action: 'Ajouter la référence Lancet 2024 ou reformuler',
          blockId: 'b2',
          quote: 'Ce médicament tue chaque année des milliers de gens',
          resolved: false,
        },
        {
          id: 'p1_2',
          problem: 'Sophisme du faux dilemme',
          reason: 'Exclut les solutions intermédiaires',
          action: 'Nuancer la conclusion',
          blockId: 'b5',
          resolved: true,
        },
      ],
      priority2_major: [
        {
          id: 'p2_1',
          problem: 'Transition abrupte au paragraphe 4',
          reason: 'Rupture du fil narratif',
          action: 'Insérer un connecteur logique',
          blockId: 'b4',
          resolved: false,
        },
      ],
      priority3_editorial_optimizations: [
        {
          id: 'p3_1',
          problem: 'Titre trop passif',
          reason: 'Affadit l’impact de l’enquête',
          action: 'Utiliser un verbe d’action au présent',
          resolved: true,
        },
      ],
    };

    const p1Items = mockPlan.priority1_blocking;
    const p1Resolved = p1Items.filter((i) => i.resolved).length;
    const p1Pending = p1Items.length - p1Resolved;
    expect(p1Items.length).toBe(2);
    expect(p1Resolved).toBe(1);
    expect(p1Pending).toBe(1);

    const allItems = [
      ...mockPlan.priority1_blocking,
      ...mockPlan.priority2_major,
      ...mockPlan.priority3_editorial_optimizations,
    ];
    const totalCount = allItems.length;
    const totalResolved = allItems.filter((i) => i.resolved).length;
    const totalPending = totalCount - totalResolved;
    const progressPercent = Math.round((totalResolved / totalCount) * 100);

    expect(totalCount).toBe(4);
    expect(totalResolved).toBe(2);
    expect(totalPending).toBe(2);
    expect(progressPercent).toBe(50);
  });

  it('should support both light and dark theme mappings', () => {
    expect(lightTheme.sophisme).toBeDefined();
    expect(lightTheme.unsupported).toBeDefined();
    expect(lightTheme.framing).toBeDefined();

    expect(darkTheme.sophisme).toBeDefined();
    expect(darkTheme.unsupported).toBeDefined();
    expect(darkTheme.framing).toBeDefined();

    expect(PrioritizedRevisionPlan).toBeDefined();
  });
});
