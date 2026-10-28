/**
 * Builds the iPhone shortcut "Analyser avec Squiggle" and signs it, on a Mac:
 *
 *   node web/shortcut/build.mjs
 *
 * One shortcut in the share sheet, for two kinds of input:
 * - a Safari page: `page.ts`, bundled with the extension's extractor, reads
 *   the article in the page and returns the address of /analyser with it
 *   after the `#`;
 * - screenshots shared from Photos: each one's text is read on the device
 *   ("Extraire le texte de l'image"), its broken lines joined, the captures
 *   put one after the other, and the whole sent the same way.
 *
 * The site reads `#title=…&text=…&url=…` on /analyser (`sharedParams` in
 * `web/src/paste.ts`). The fragment never leaves the phone: nothing passes
 * through a server, ours or anyone's.
 *
 * Signing needs macOS and an Apple account signed in on this Mac: `shortcuts
 * sign --mode anyone` lets anyone import the file, without an iCloud link. The
 * signed file is committed, since nothing else can sign it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSync } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(here, '..', 'public', 'raccourci', 'Analyser avec Squiggle.shortcut');
const ORIGIN = 'https://squiggle.fr';

const attachment = (value) => ({ Value: value, WFSerializationType: 'WFTextTokenAttachment' });
const input = (aggrandizements) =>
  attachment(aggrandizements ? { Type: 'ExtensionInput', Aggrandizements: aggrandizements } : { Type: 'ExtensionInput' });
const output = (uuid, name) => attachment({ Type: 'ActionOutput', OutputUUID: uuid, OutputName: name });
const action = (id, parameters) => ({
  WFWorkflowActionIdentifier: `is.workflow.actions.${id}`,
  WFWorkflowActionParameters: parameters,
});

// Fixed identifiers, so a rebuild with no change gives the same plist.
const IF = 'A1D4C0DE-0000-4000-8000-000000000001';
const EACH = 'A1D4C0DE-0000-4000-8000-000000000002';
const SCRIPT = 'A1D4C0DE-0000-4000-8000-000000000003';
const READ = 'A1D4C0DE-0000-4000-8000-000000000004';
const JOINED = 'A1D4C0DE-0000-4000-8000-000000000005';
const CAPTURES = 'A1D4C0DE-0000-4000-8000-000000000006';
const COMBINED = 'A1D4C0DE-0000-4000-8000-000000000007';
const ENCODED = 'A1D4C0DE-0000-4000-8000-000000000008';
const ADDRESS = 'A1D4C0DE-0000-4000-8000-000000000009';

const script = buildSync({
  entryPoints: [join(here, 'page.ts')],
  bundle: true,
  format: 'iife',
  target: 'safari15',
  minify: true,
  write: false,
}).outputFiles[0].text;

const prefix = `${ORIGIN}/analyser#text=`;

const workflow = {
  WFWorkflowClientVersion: '1146.14',
  WFWorkflowMinimumClientVersion: 900,
  WFWorkflowMinimumClientVersionString: '900',
  WFWorkflowIcon: { WFWorkflowIconStartColor: 4282601983, WFWorkflowIconGlyphNumber: 59446 },
  WFWorkflowTypes: ['ActionExtension'],
  WFWorkflowInputContentItemClasses: ['WFSafariWebPageContentItem', 'WFImageContentItem'],
  WFWorkflowOutputContentItemClasses: [],
  WFWorkflowHasShortcutInputVariables: true,
  WFWorkflowImportQuestions: [],
  WFWorkflowActions: [
    // Input that is a Safari page: an image never becomes one, so this is the page branch.
    action('conditional', {
      GroupingIdentifier: IF,
      WFControlFlowMode: 0,
      WFCondition: 100,
      WFInput: {
        Type: 'Variable',
        Variable: input([{ Type: 'WFCoercionVariableAggrandizement', CoercionItemClass: 'WFSafariWebPageContentItem' }]),
      },
    }),
    action('runjavascriptonwebpage', {
      UUID: SCRIPT,
      WFInput: input(),
      WFJavaScript: script,
    }),
    action('openurl', { WFInput: output(SCRIPT, 'Résultat JavaScript') }),
    action('conditional', { GroupingIdentifier: IF, WFControlFlowMode: 1 }),
    action('repeat.each', { GroupingIdentifier: EACH, WFControlFlowMode: 0, WFInput: input() }),
    action('extracttextfromimage', {
      UUID: READ,
      WFImage: attachment({ Type: 'Variable', VariableName: 'Repeat Item' }),
    }),
    // A screen cuts a paragraph into lines: join a line to the next unless it ends a sentence.
    action('text.replace', {
      UUID: JOINED,
      WFInput: output(READ, 'Texte de l’image'),
      WFReplaceTextRegularExpression: true,
      WFReplaceTextFind: '([^.!?…:»"”\\n])\\n(?=[^\\n])',
      WFReplaceTextReplace: '$1 ',
    }),
    action('repeat.each', { GroupingIdentifier: EACH, WFControlFlowMode: 2, UUID: CAPTURES }),
    action('text.combine', {
      UUID: COMBINED,
      text: output(CAPTURES, 'Résultats de répétition'),
      WFTextSeparator: 'Custom',
      WFTextCustomSeparator: '\n\n',
    }),
    action('urlencode', { UUID: ENCODED, WFEncodeMode: 'Encode', WFInput: output(COMBINED, 'Texte combiné') }),
    action('gettext', {
      UUID: ADDRESS,
      WFTextActionText: {
        Value: {
          string: `${prefix}￼`,
          attachmentsByRange: {
            [`{${prefix.length}, 1}`]: { Type: 'ActionOutput', OutputUUID: ENCODED, OutputName: 'Texte encodé' },
          },
        },
        WFSerializationType: 'WFTextTokenString',
      },
    }),
    action('openurl', { WFInput: output(ADDRESS, 'Texte') }),
    action('conditional', { GroupingIdentifier: IF, WFControlFlowMode: 2 }),
  ],
};

const work = mkdtempSync(join(tmpdir(), 'squiggle-raccourci-'));
const unsigned = join(work, 'Analyser avec Squiggle.shortcut');
writeFileSync(unsigned, JSON.stringify(workflow));
execFileSync('plutil', ['-convert', 'binary1', unsigned]);
execFileSync('shortcuts', ['sign', '--mode', 'anyone', '--input', unsigned, '--output', OUTPUT], { stdio: 'inherit' });
console.log(`Signé : ${OUTPUT}`);
