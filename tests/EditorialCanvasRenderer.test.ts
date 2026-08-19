import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { EditorialCanvasRenderer } from '../src/canvas/EditorialCanvasRenderer';
import { EditorialCardData } from '../src/canvas/types';

describe('EditorialCanvasRenderer', () => {
  let mockContext: Record<string, Mock | string | number | boolean>;
  let mockCanvas: HTMLCanvasElement;

  const mockData: EditorialCardData = {
    title: 'Analyse critique du rapport sur les énergies renouvelables',
    url: 'https://example.com/article-editorial-test',
    reviewDate: '18 août 2026',
    reviewer: 'Jean Rédacteur',
    reliabilityScore: 78,
    verdict: 'corrections',
    domainScores: [
      { id: 'sources', name: 'Sources & Citations', score: 85 },
      { id: 'logic', name: 'Raisonnement & Logique', score: 65 },
      { id: 'framing', name: 'Cadrage & Neutralité', score: 70 },
      { id: 'facts', name: 'Exactitude Factuelle', score: 80 },
      { id: 'clarity', name: 'Clarté & Précision', score: 90 },
    ],
    keyFindings: [
      {
        id: 'f1',
        category: 'unsupported',
        severity: 'major',
        title: 'Chiffres avancés sans lien de référence vérifiable',
        excerpt: 'Une hausse de 400% des coûts sans mention de l’étude source.',
      },
      {
        id: 'f2',
        category: 'framing',
        severity: 'minor',
        title: 'Biais de sélection dans les exemples cités',
      },
    ],
    summaryText: 'Le texte présente une bonne base factuelle mais manque de rigueur méthodologique.',
  };

  beforeEach(() => {
    mockContext = {
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'top',
      lineCap: 'butt',
    };

    mockCanvas = {
      getContext: vi.fn(() => mockContext),
      toBlob: vi.fn((callback: (b: Blob | null) => void) => {
        const dummyBlob = new Blob(['test-png-data'], { type: 'image/png' });
        callback(dummyBlob);
      }),
      style: {},
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement;
  });

  it('initializes with default options and scales canvas with pixelRatio', () => {
    const renderer = new EditorialCanvasRenderer({
      width: 800,
      height: 1000,
      pixelRatio: 2,
      theme: 'light',
    });

    renderer.render(mockCanvas, mockData);

    expect(mockCanvas.width).toBe(1600);
    expect(mockCanvas.height).toBe(2000);
    expect(mockCanvas.style.width).toBe('800px');
    expect(mockCanvas.style.height).toBe('1000px');
    expect(mockContext.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('renders all sections: masthead, metadata, scores, verdict stamp, domain bars, findings, and footer', () => {
    const renderer = new EditorialCanvasRenderer({ theme: 'light' });
    renderer.render(mockCanvas, mockData);

    expect(mockContext.fillRect).toHaveBeenCalled();
    expect(mockContext.strokeRect).toHaveBeenCalled();
    expect(mockContext.fillText).toHaveBeenCalled();

    // Verify verdict text rendered
    const fillTextMock = mockContext.fillText as Mock;
    const fillTextCalls = fillTextMock.mock.calls.map((c) => c[0] as string);
    expect(fillTextCalls.some((t: string) => t.includes('CORRECTIONS'))).toBe(true);
    expect(fillTextCalls.some((t: string) => t.includes('SQUIGGLE'))).toBe(true);
    expect(fillTextCalls.some((t: string) => t.includes('INDICE DE FIABILITÉ'))).toBe(true);
  });

  it('supports dark theme rendering properly', () => {
    const renderer = new EditorialCanvasRenderer({ theme: 'dark' });
    renderer.render(mockCanvas, { ...mockData, verdict: 'publier', reliabilityScore: 92 });

    expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
    expect(mockContext.fillText).toHaveBeenCalled();
  });

  it('converts canvas to PNG Blob via toBlob static method', async () => {
    const blob = await EditorialCanvasRenderer.toBlob(mockCanvas);
    expect(blob).toBeDefined();
    expect(blob.type).toBe('image/png');
  });

  it('handles clipboard copy when clipboard API is available', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        write: mockWrite,
      },
      configurable: true,
      writable: true,
    });

    // Mock global ClipboardItem
    class MockClipboardItem {
      public data: Record<string, Blob>;
      constructor(data: Record<string, Blob>) {
        this.data = data;
      }
    }
    (global as unknown as { ClipboardItem: typeof MockClipboardItem }).ClipboardItem = MockClipboardItem;

    await EditorialCanvasRenderer.copyToClipboard(mockCanvas);
    expect(mockWrite).toHaveBeenCalled();
  });

  it('handles download PNG trigger via DOM anchor creation', async () => {
    const mockClick = vi.fn();
    const mockAppendChild = vi.fn((el) => el);
    const mockRemoveChild = vi.fn((el) => el);

    const fakeAnchor = {
      href: '',
      download: '',
      click: mockClick,
    };
    const fakeDocument = {
      body: {
        appendChild: mockAppendChild,
        removeChild: mockRemoveChild,
      },
      createElement: vi.fn(() => fakeAnchor),
    };

    (global as unknown as { document: unknown }).document = fakeDocument;

    const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
    const mockRevokeObjectURL = vi.fn();
    (global as unknown as { URL: unknown }).URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    };

    await EditorialCanvasRenderer.downloadPng(mockCanvas, 'custom-card.png');

    expect(mockClick).toHaveBeenCalled();
    expect(mockAppendChild).toHaveBeenCalledWith(fakeAnchor);
    expect(mockRemoveChild).toHaveBeenCalledWith(fakeAnchor);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
