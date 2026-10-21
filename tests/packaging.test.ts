import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CONTENT_SCRIPT_FILE } from '../src/messaging/runtime';
import { ALL_SITES } from '../src/permissions/siteAccess';

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

    // The Chromium sign-in landing page must be at the package root and
    // web-accessible, because the web app navigates to exactly that path
    // (web/BRIDGE.md §2). A missing file or a missing WAR entry breaks
    // sign-in silently.
    expect(fs.existsSync(path.join(chromeDist, 'squiggle-auth.html'))).toBe(true);
    const chromeWar = (manifest.web_accessible_resources ?? []).flatMap(
      (r: { resources: string[] }) => r.resources
    );
    expect(chromeWar).toContain('squiggle-auth.html');
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
    // Built for parity; Firefox uses the manual code path instead.
    expect(fs.existsSync(path.join(firefoxDist, 'squiggle-auth.html'))).toBe(true);
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
  /**
   * Four identical 70-byte placeholders shipped for months: every size was the
   * same stub, so the extension had no icon anywhere and nothing failed. A real
   * icon set has one distinct raster per size, and none of them is a stub.
   */
  it.each([
    ['chrome', chromeDist],
    ['firefox', firefoxDist],
  ])('%s build ships a real icon at every declared size', (_target, dist) => {
    const sizes = [16, 32, 48, 128];
    const contents = sizes.map((size) => {
      const file = path.join(dist, 'src/assets', `icon-${size}.png`);
      expect(fs.existsSync(file), `icon-${size}.png is missing`).toBe(true);
      const bytes = fs.readFileSync(file);
      // A PNG carrying an actual mark at these sizes cannot be this small.
      expect(bytes.byteLength, `icon-${size}.png looks like a placeholder`).toBeGreaterThan(150);
      return bytes.toString('base64');
    });

    expect(new Set(contents).size).toBe(sizes.length);
  });

  /**
   * The version used to be typed into package.json and both manifests. A release
   * cannot rely on that: the stores reject re-uploading a version already
   * published, so one stale copy blocks a release outright, and two copies that
   * disagree ship builds claiming to be different versions of the same thing.
   */
  it.each([
    ['chrome', chromeDist],
    ['firefox', firefoxDist],
  ])('%s manifest takes its version from package.json', (_target, dist) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'),
    ) as { version: string };
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dist, 'manifest.json'), 'utf-8'),
    ) as { version: string };

    expect(manifest.version).toBe(pkg.version);
  });

  /**
   * Every permission has to be justified to a store reviewer one by one, and a
   * permission the code never exercises cannot be justified truthfully. Declaring
   * one is also a straightforward rejection. So the list is pinned rather than
   * spot-checked: adding to it should mean writing the justification too.
   */
  it.each([
    ['chrome', ['activeTab', 'storage', 'sidePanel', 'scripting']],
    ['firefox', ['activeTab', 'storage', 'scripting']],
  ])('%s declares exactly the permissions the code uses', (target, expected) => {
    const dist = target === 'chrome' ? chromeDist : firefoxDist;
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dist, 'manifest.json'), 'utf-8'),
    ) as { permissions: string[] };

    expect(manifest.permissions).toEqual(expected);
  });

  /**
   * What the stores review hardest is reach: a static `<all_urls>` content script
   * and all-sites host access trigger an in-depth review, and the permission
   * prompt a reader sees at install says "read and change all your data". The
   * extension reads the page it was invoked on (`activeTab`), so the broad
   * patterns are optional and the content script is injected, never declared.
   */
  describe.each([
    ['chrome', chromeDist],
    ['firefox', firefoxDist],
  ])('%s reach', (_target, dist) => {
    const manifest = () =>
      JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf-8')) as {
        host_permissions?: string[];
        optional_host_permissions?: string[];
        content_scripts?: unknown[];
      };

    it('declares no static content script', () => {
      expect(manifest().content_scripts).toBeUndefined();
    });

    it('ships the injectable content script as a classic script', () => {
      const file = path.join(dist, CONTENT_SCRIPT_FILE);
      expect(fs.existsSync(file), `${CONTENT_SCRIPT_FILE} is missing`).toBe(true);
      const code = fs.readFileSync(file, 'utf-8');
      // An injected file runs as a classic script, so a module statement would be a syntax error.
      expect(code).not.toMatch(/^\s*(import|export)\s/m);
    });

    it('requests host access only for the model providers', () => {
      expect(manifest().host_permissions).toEqual([
        'https://api.anthropic.com/*',
        'https://api.openai.com/*',
        'https://openrouter.ai/*',
        'https://generativelanguage.googleapis.com/*',
      ]);
    });

    it('offers every site as an optional permission, matching what the settings ask for', () => {
      expect(manifest().optional_host_permissions).toEqual(ALL_SITES);
    });
  });

  /** The store listing's summary line is the manifest description, and the store caps it. */
  it.each([
    ['chrome', chromeDist],
    ['firefox', firefoxDist],
  ])('%s description fits the 132 characters a store listing allows', (_target, dist) => {
    const { description } = JSON.parse(
      fs.readFileSync(path.join(dist, 'manifest.json'), 'utf-8'),
    ) as { description: string };

    expect(description.length).toBeLessThanOrEqual(132);
  });

  /**
   * `data_collection_permissions` is understood from Firefox 140. An older minimum
   * is rejected by the AMO validator, and a browser that does not know the key
   * installs the extension without ever showing the reader the disclosure.
   */
  it('firefox requires a release that understands data_collection_permissions', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(firefoxDist, 'manifest.json'), 'utf-8'),
    ) as { browser_specific_settings: { gecko: { strict_min_version: string; data_collection_permissions?: unknown } } };
    const { strict_min_version, data_collection_permissions } = manifest.browser_specific_settings.gecko;

    expect(data_collection_permissions).toBeDefined();
    expect(parseInt(strict_min_version, 10)).toBeGreaterThanOrEqual(140);
  });
});
