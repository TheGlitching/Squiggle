import React, { useRef, useEffect, useState, useCallback } from 'react';
import { EditorialCanvasRenderer } from './EditorialCanvasRenderer';
import { EditorialCardData, CanvasExportOptions } from './types';
import { Download, Copy, Check, RefreshCw, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react';

export interface EditorialReviewCardProps {
  data: EditorialCardData;
  options?: CanvasExportOptions;
  className?: string;
  onExportSuccess?: (type: 'download' | 'clipboard') => void;
  onExportError?: (error: Error, type: 'download' | 'clipboard') => void;
}

export const EditorialReviewCard: React.FC<EditorialReviewCardProps> = ({
  data,
  options = {},
  className = '',
  onExportSuccess,
  onExportError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(options.theme || 'light');
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(0.65);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const logicalWidth = options.width || 840;
  const logicalHeight = options.height || 1120;

  const renderCard = useCallback(() => {
    if (!canvasRef.current) return;
    try {
      const renderer = new EditorialCanvasRenderer({
        ...options,
        theme,
        width: logicalWidth,
        height: logicalHeight,
      });
      renderer.render(canvasRef.current, data);
      setErrorMsg(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setErrorMsg(error.message);
    }
  }, [data, options, theme, logicalWidth, logicalHeight]);

  useEffect(() => {
    renderCard();
  }, [renderCard]);

  const handleDownload = async () => {
    if (!canvasRef.current || isExporting) return;
    setIsExporting(true);
    setErrorMsg(null);
    try {
      const filename = `revue-editoriale-${data.verdict}-${Date.now()}.png`;
      await EditorialCanvasRenderer.downloadPng(canvasRef.current, filename);
      if (onExportSuccess) onExportSuccess('download');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setErrorMsg(`Échec du téléchargement : ${error.message}`);
      if (onExportError) onExportError(error, 'download');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyClipboard = async () => {
    if (!canvasRef.current || isExporting) return;
    setIsExporting(true);
    setErrorMsg(null);
    try {
      await EditorialCanvasRenderer.copyToClipboard(canvasRef.current);
      setCopied(true);
      if (onExportSuccess) onExportSuccess('clipboard');
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setErrorMsg(`Échec de copie : ${error.message}`);
      if (onExportError) onExportError(error, 'clipboard');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`flex flex-col items-center bg-stone-100 dark:bg-stone-900 border border-stone-300 dark:border-stone-800 rounded-xl p-4 md:p-6 shadow-xl ${className}`}>
      {/* Control Bar */}
      <div className="w-full max-w-2xl flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-stone-200 dark:border-stone-800 text-sm font-mono">
        <div className="flex items-center gap-2">
          <span className="font-serif font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wide">
            Fiche Éditoriale Export
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
            2x Retina
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme switcher */}
          <button
            type="button"
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition"
            title="Basculer le thème clair / sombre"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="text-xs capitalize">{theme}</span>
          </button>

          {/* Zoom In / Out */}
          <div className="flex items-center border border-stone-300 dark:border-stone-700 rounded-lg overflow-hidden bg-white dark:bg-stone-800">
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.35, s - 0.1))}
              className="p-1.5 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition"
              title="Zoom arrière"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs text-stone-700 dark:text-stone-300">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(1.0, s + 0.1))}
              className="p-1.5 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition"
              title="Zoom avant"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMsg && (
        <div className="w-full max-w-2xl flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Canvas viewport container */}
      <div
        className="relative overflow-auto max-w-full flex justify-center p-4 bg-stone-200/60 dark:bg-stone-950/60 rounded-lg border border-stone-300 dark:border-stone-800"
        style={{ maxHeight: '72vh' }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            width: `${logicalWidth}px`,
            height: `${logicalHeight}px`,
            transition: 'transform 0.15s ease-out',
          }}
          className="shadow-2xl rounded-sm overflow-hidden"
        >
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Action Footer Buttons */}
      <div className="w-full max-w-2xl flex flex-wrap items-center justify-end gap-3 mt-6 pt-4 border-t border-stone-200 dark:border-stone-800">
        <button
          type="button"
          onClick={handleCopyClipboard}
          disabled={isExporting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-medium text-sm hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 transition shadow-sm"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copié dans le presse-papier !' : 'Copier l’image'}</span>
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={isExporting}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-800 hover:bg-red-900 text-white font-medium text-sm disabled:opacity-50 transition shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>Télécharger PNG (2x)</span>
        </button>
      </div>
    </div>
  );
};
