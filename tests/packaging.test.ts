import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Multi-browser Build & Packaging Verification', () => {
  const chromeDist = path.resolve(__dirname, '../dist/chrome');
  const firefoxDist = path.resolve(__dirname, '../dist/firefox');

  it('generates dist/chrome distribution folder with valid MV3 manifest', () => {
    expect(fs.existsSync(chromeDist)).toBe(true);

    const manifestPath = path.join(chromeDist, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('Squiggle - Analyse critique de presse');
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.permissions).toContain('storage');
    expect(manifest.permissions).toContain('activeTab');
    expect(manifest.side_panel?.default_path).toBe('src/sidepanel/index.html');
    expect(manifest.background?.service_worker).toBeDefined();

    // Check entry html files
    expect(fs.existsSync(path.join(chromeDist, 'src/sidepanel/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(chromeDist, 'src/welcome/index.html'))).toBe(true);
  });

  it('generates dist/firefox distribution folder with valid MV3 manifest and gecko settings', () => {
    expect(fs.existsSync(firefoxDist)).toBe(true);

    const manifestPath = path.join(firefoxDist, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.browser_specific_settings?.gecko?.id).toBe('squiggle@presse-critique.fr');
    expect(manifest.sidebar_action?.default_panel).toBe('src/sidepanel/index.html');
    expect(manifest.background?.scripts).toBeDefined();
    expect(manifest.permissions).not.toContain('sidePanel'); // sidePanel is Chrome-specific

    // Check entry html files
    expect(fs.existsSync(path.join(firefoxDist, 'src/sidepanel/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(firefoxDist, 'src/welcome/index.html'))).toBe(true);
  });

  /**
   * Chrome refuses to load an unpacked extension whose tree contains any file
   * or directory whose name starts with an underscore, apart from the reserved
   * `_locales`. One stray file anywhere is a hard load failure with no partial
   * mode, so the whole tree is checked rather than the top level.
   */
  it.each([
    ['chrome', chromeDist],
    ['firefox', firefoxDist],
  ])('%s build contains no filenames reserved by the browser', (_target, dist) => {
    const reserved: string[] = [];
    const walk = (dir: string, rel = '') => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('_') && entry.name !== '_locales') {
          reserved.push(path.join(rel, entry.name));
        }
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), path.join(rel, entry.name));
        }
      }
    };
    walk(dist);

    expect(reserved).toEqual([]);
  });
});
