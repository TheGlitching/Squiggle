/**
 * The classroom mode, page by page. Pinned: a session file opens with no
 * account and is marked as such; the preparation reorders and removes
 * findings and downloads the file; the desk opens the board and answers it
 * over the channel, keys included; the board shows only what was revealed and
 * forwards its keys; the student sheet carries no answer, the answer sheet
 * every one, in the chosen order.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import {
  addNote,
  CHANNEL,
  loadSeance,
  newSeance,
  noteFrom,
  saveSeance,
  seanceFile,
  startState,
  type Message,
  type Seance,
} from '../src/classe';
import { Tableau } from '../src/pages/Tableau';
import { lesson, memoryStorage } from './helpers';

const channels: BroadcastChannel[] = [];

/** The other end of the channel, as the board or the desk would hold it. */
function listen(): { messages: Message[]; post: (message: Message) => void } {
  const channel = new BroadcastChannel(CHANNEL);
  channels.push(channel);
  const messages: Message[] = [];
  channel.onmessage = (event: MessageEvent<Message>) => messages.push(event.data);
  return { messages, post: (message) => channel.postMessage(message) };
}

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

async function sessionFile(seance: Seance = newSeance(lesson())): Promise<File> {
  return new File([await seanceFile(seance).text()], 'Séance Squiggle - Lecture.squiggle');
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', memoryStorage());
  saveSeance(null);
});

afterEach(() => {
  cleanup();
  for (const channel of channels.splice(0)) channel.close();
  saveSeance(null);
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

describe('/classe, before any session', () => {
  it('opens a session file without an account, and says it came from a file', async () => {
    const { container } = renderAt('/classe');
    expect(screen.getByRole('heading', { level: 1, name: 'Le mode classe' })).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await sessionFile());

    expect(await screen.findByRole('heading', { level: 1, name: 'Préparer la séance' })).toBeInTheDocument();
    expect(screen.getByText(/Séance ouverte depuis un fichier/)).toBeInTheDocument();
    expect(loadSeance()?.fromFile).toBe(true);
    // Nothing was asked of a server.
    expect(screen.getByText('Vue enseignant · vos élèves ne voient pas cet écran')).toBeInTheDocument();
  });

  it('refuses a file that is not a session, with a sentence', async () => {
    const { container } = renderAt('/classe');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['bonjour'], 'notes.squiggle'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce fichier n’est pas une séance Squiggle.');
    expect(screen.queryByRole('heading', { name: 'Préparer la séance' })).toBeNull();
  });

  it('explains a lesson step by step, and links the page to print', async () => {
    renderAt('/classe');
    const guide = within(screen.getByRole('region', { name: 'Une séance, pas à pas' }));
    expect(guide.getByText('Étape 1 sur 6')).toBeInTheDocument();
    await userEvent.click(guide.getByRole('button', { name: 'Étape suivante →' }));
    expect(guide.getByRole('heading', { name: 'Téléchargez le fichier de séance' })).toBeInTheDocument();
    expect(guide.getByText(/dossier Téléchargements/)).toBeInTheDocument();
    expect(guide.getByText('L’écran étendu')).toBeInTheDocument();
    expect(guide.getByRole('link', { name: 'Imprimer ce mode d’emploi (une page)' })).toHaveAttribute('href', '/classe/mode-emploi');
  });
});

describe('/classe, the preparation', () => {
  beforeEach(() => saveSeance(newSeance(lesson())));

  it('shows every answer, numbered in the reveal order, with the question to ask', async () => {
    renderAt('/classe');
    const article = screen.getByRole('article', { name: 'L’article, avec tout le corrigé' });
    expect(article.querySelectorAll('mark')).toHaveLength(6);
    expect(within(article).getByLabelText('constat 1').closest('mark')).toHaveTextContent('une étude');
    await userEvent.click(screen.getByRole('button', { name: 'Chiffre mis en doute' }));
    expect(screen.getByText('Jugé douteux, pas faux : pourquoi cette nuance ?')).toBeInTheDocument();
  });

  it('reorders and removes findings, and keeps the choice', async () => {
    renderAt('/classe');
    await userEvent.click(screen.getByRole('button', { name: 'Descendre « Étude non nommée »' }));
    expect(loadSeance()?.order.slice(0, 2)).toEqual(['f2', 'f1']);
    const item = screen.getByRole('button', { name: 'Faux dilemme' }).closest('li') as HTMLElement;
    await userEvent.click(within(item).getByRole('button', { name: 'Retirer de la séance' }));
    expect(loadSeance()?.left).toEqual(['f2']);
    expect(screen.getByText('5 constats à révéler. Le tableau s’ouvre dans une seconde fenêtre, pour le projecteur.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /Masquer la note en classe/ }));
    expect(loadSeance()?.hideScore).toBe(false);
  });

  it('downloads the session as one file, named after the article, and says where it went', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (blob: Blob) => (blobs.push(blob), 'blob:x'), revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderAt('/classe');
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger la séance' }));
    expect(click).toHaveBeenCalled();
    expect(JSON.parse(await blobs[0].text())).toMatchObject({ format: 'squiggle-seance', version: 1, title: lesson().title });
    expect(screen.getByRole('status')).toHaveTextContent(
      'C’est fait. Le fichier « Séance Squiggle - Lecture une génération perdue.squiggle » est en général dans votre dossier Téléchargements.',
    );
    click.mockRestore();
  });

  it('adds a remark of the teacher’s own, then edits and deletes it', async () => {
    renderAt('/classe');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une remarque' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter une remarque' });
    await userEvent.type(within(dialog).getByLabelText('Les mots du passage'), 'des mots absents');
    await userEvent.type(within(dialog).getByLabelText('Votre remarque'), 'Le mot dramatise.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter la remarque' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Ces mots ne sont pas dans l’article.');

    await userEvent.clear(within(dialog).getByLabelText('Les mots du passage'));
    await userEvent.type(within(dialog).getByLabelText('Les mots du passage'), 'le constat inquiète');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Cadrage/ }));
    await userEvent.type(within(dialog).getByLabelText(/Question pour la classe/), 'Qui s’inquiète ?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter la remarque' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(loadSeance()?.notes).toMatchObject([{ quote: 'le constat inquiète', category: 'cadrage', question: 'Qui s’inquiète ?' }]);
    const article = screen.getByRole('article', { name: 'L’article, avec tout le corrigé' });
    expect(within(article).getByLabelText('constat 7').closest('mark')).toHaveTextContent('le constat inquiète');
    const item = screen.getByRole('button', { name: 'Votre remarque' }).closest('li') as HTMLElement;
    expect(item).toHaveTextContent('remarque de l’enseignant');
    expect(item).toHaveTextContent('Qui s’inquiète ?');

    await userEvent.click(within(item).getByRole('button', { name: 'Modifier votre remarque sur « le constat inquiète »' }));
    const edit = screen.getByRole('dialog', { name: 'Modifier votre remarque' });
    await userEvent.clear(within(edit).getByLabelText('Votre remarque'));
    await userEvent.type(within(edit).getByLabelText('Votre remarque'), 'Un constat sans chiffre.');
    await userEvent.click(within(edit).getByRole('button', { name: 'Enregistrer' }));
    expect(loadSeance()?.notes[0].explanation).toBe('Un constat sans chiffre.');

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer votre remarque sur « le constat inquiète »' }));
    expect(loadSeance()?.notes).toEqual([]);
    expect(article.querySelectorAll('mark')).toHaveLength(6);
  });

  it('closes the remark form with Escape, adding nothing', async () => {
    renderAt('/classe');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une remarque' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(loadSeance()?.notes).toEqual([]);
  });

  it('forgets the session when the teacher closes it', async () => {
    renderAt('/classe');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer cette séance' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Le mode classe' })).toBeInTheDocument();
    expect(loadSeance()).toBeNull();
  });
});

describe('/classe, the lesson', () => {
  beforeEach(() => saveSeance(newSeance(lesson())));

  it('opens the board, answers it, and runs the lesson from the keyboard', async () => {
    const open = vi.fn(() => ({ closed: false }) as Window);
    vi.stubGlobal('open', open);
    renderAt('/classe');
    await userEvent.click(screen.getByRole('button', { name: 'Lancer en classe' }));
    expect(open).toHaveBeenCalledWith('/classe/tableau', 'squiggle-tableau', expect.stringContaining('popup'));
    expect(screen.getByText('Vous seul voyez cet écran')).toBeInTheDocument();

    const board = listen();
    board.post({ type: 'hello' });
    await waitFor(() => expect(board.messages.some((m) => m.type === 'state')).toBe(true));
    const last = () => board.messages.filter((m) => m.type === 'state').at(-1) as Extract<Message, { type: 'state' }>;
    expect(last().state).toMatchObject({ phase: 'lecture', showScore: false });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(last().state.phase).toBe('reperage'));
    await userEvent.click(within(screen.getByRole('list', { name: 'Les phrases de l’article' })).getAllByRole('button', { pressed: false })[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Une main de plus, phrase 2' }));
    await waitFor(() => expect(last().state.marks).toEqual({ 2: 1 }));

    // The board's own keys run the desk too.
    board.post({ type: 'key', key: 'next' });
    board.post({ type: 'key', key: 'next' });
    await waitFor(() => expect(last().state).toMatchObject({ phase: 'revelation', revealed: 1 }));
    expect(screen.getByText('Prochain · vous seul le voyez').parentElement).toHaveTextContent('Faux dilemme');
    expect(screen.getByText('Prochain · vous seul le voyez').parentElement).toHaveTextContent('la classe ne l’avait pas vu');

    await userEvent.click(screen.getByRole('button', { name: 'Afficher la note' }));
    await waitFor(() => expect(last().state.showScore).toBe(true));

    await userEvent.click(screen.getByRole('button', { name: 'Terminer la séance' }));
    await waitFor(() => expect(board.messages.at(-1)).toEqual({ type: 'end' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Préparer la séance' })).toBeInTheDocument();
  });

  it('says so when the browser blocks the board, and offers to open it', async () => {
    vi.stubGlobal('open', vi.fn(() => null));
    renderAt('/classe');
    await userEvent.click(screen.getByRole('button', { name: 'Lancer en classe' }));
    expect(screen.getByText(/Le navigateur a bloqué la fenêtre du tableau/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvrir le tableau' })).toBeInTheDocument();
  });
});

describe('/classe/tableau', () => {
  it('waits for the desk, then shows only what was revealed, and forwards its keys', async () => {
    const desk = listen();
    render(<Tableau />);
    expect(screen.getByRole('heading', { name: 'Cette fenêtre est le tableau' })).toBeInTheDocument();
    await waitFor(() => expect(desk.messages).toContainEqual({ type: 'hello' }));

    const seance = { ...newSeance(lesson()), fromFile: true };
    const state = { ...startState(seance), phase: 'revelation' as const, revealed: 2, marks: { 3: 5 } };
    act(() => desk.post({ type: 'state', seance, state }));
    const board = await screen.findByRole('region', { name: 'Le tableau' });
    const marks = [...board.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marks).toEqual(['une étude', 'ils ne lisent plus']);
    expect(within(board).getByText('5 mains')).toBeInTheDocument();
    expect(within(board).getByText('Faux dilemme')).toBeInTheDocument();
    expect(within(board).queryByText('Exagération')).toBeNull();
    // A file is not presented as Squiggle's own analysis; the score stays hidden.
    expect(board).toHaveTextContent('Séance ouverte depuis un fichier · analyse automatisée du');
    expect(board).toHaveTextContent('elle peut se tromper');
    expect(within(board).queryByText(/\/100/)).toBeNull();

    fireEvent.keyDown(window, { key: 'PageDown' });
    fireEvent.keyDown(window, { key: 'b' });
    await waitFor(() =>
      expect(desk.messages.filter((m) => m.type === 'key')).toEqual([
        { type: 'key', key: 'next' },
        { type: 'key', key: 'black' },
      ]),
    );

    act(() => desk.post({ type: 'state', seance, state: { ...state, black: true } }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Le tableau' })).toHaveAttribute('data-black', 'true'));
    act(() => desk.post({ type: 'end' }));
    expect(await screen.findByRole('heading', { name: 'Séance terminée' })).toBeInTheDocument();
  });

  it('shows a teacher’s remark as the teacher’s, never as the analysis', async () => {
    const desk = listen();
    render(<Tableau />);
    await waitFor(() => expect(desk.messages).toContainEqual({ type: 'hello' }));
    const base = newSeance(lesson());
    const note = noteFrom(base, { words: 'le constat inquiète', category: 'cadrage', explanation: 'Le mot dramatise.', question: '' }, 'remarque-1')!;
    const seance = { ...addNote(base, note), order: ['remarque-1', ...base.order] };
    act(() => desk.post({ type: 'state', seance, state: { ...startState(seance), phase: 'revelation', revealed: 1 } }));
    const board = await screen.findByRole('region', { name: 'Le tableau' });
    expect([...board.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['le constat inquiète']);
    expect(within(board).getByText('Remarque de l’enseignant')).toBeInTheDocument();
    expect(within(board).getByText('Le mot dramatise.')).toBeInTheDocument();
  });

  it('is the board alone: no header, no footer', () => {
    renderAt('/classe/tableau');
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).toBeNull();
    // The teacher picks the board's window out by its name when moving it to the projector.
    expect(document.title).toBe('Tableau - Squiggle');
  });
});

describe('the paper', () => {
  beforeEach(() => saveSeance({ ...newSeance(lesson()), order: ['f3', 'f1', 'f2', 'f4', 'f5', 'f6'], left: ['f5'] }));

  it('gives the students the numbered text and the reasons, and none of the answers', () => {
    renderAt('/classe/fiche');
    const sheet = screen.getByRole('article', { name: 'Fiche élève' });
    expect(sheet).toHaveTextContent('2Selon une étude, 78 % des Français seraient concernés.');
    expect(sheet.querySelectorAll('mark')).toHaveLength(0);
    for (const label of ['Étude non nommée', 'Faux dilemme', '61']) expect(sheet).not.toHaveTextContent(label);
    expect(within(sheet).getAllByText('Raisonnement qui cloche')).toHaveLength(4);
    expect(sheet).toHaveTextContent('Fiche préparée avec Squiggle');
  });

  it('gives the teacher every answer, in the lesson’s order, not to hand out', () => {
    renderAt('/classe/corrige');
    const sheet = screen.getByRole('article', { name: 'Corrigé' });
    expect(sheet).toHaveTextContent('Ne pas distribuer');
    expect(sheet).toHaveTextContent('Article fragile, 61/100.');
    const items = within(sheet).getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent);
    expect(items).toEqual([
      '1. Phrase 4 · Exagération',
      '2. Phrase 2 · Étude non nommée',
      '3. Phrase 3 · Faux dilemme',
      '4. Phrase 5 · Chiffre mis en doute',
      '5. Phrase 7 · Témoins de terrain',
    ]);
    expect(sheet).toHaveTextContent('À poser : Jugé douteux, pas faux : pourquoi cette nuance ?');
    expect(sheet).toHaveTextContent('elle peut se tromper');
  });

  it('puts the teacher’s remark on the answer sheet, and nothing of it on the student sheet', () => {
    const base = newSeance(lesson());
    const note = noteFrom(base, { words: 'le constat inquiète', category: 'cadrage', explanation: 'Le mot dramatise.', question: 'Qui s’inquiète ?' }, 'remarque-1')!;
    saveSeance(addNote(base, note));
    renderAt('/classe/fiche');
    const fiche = screen.getByRole('article', { name: 'Fiche élève' });
    expect(fiche).not.toHaveTextContent('Le mot dramatise.');
    expect(fiche).not.toHaveTextContent('Remarque');
    cleanup();
    renderAt('/classe/corrige');
    const corrige = screen.getByRole('article', { name: 'Corrigé' });
    const last = within(corrige).getAllByRole('listitem').at(-1) as HTMLElement;
    expect(last).toHaveTextContent('7. Phrase 1 · Remarque de l’enseignant');
    expect(last).toHaveTextContent('Cadrage · votre remarque · « le constat inquiète »');
    expect(last).toHaveTextContent('À poser : Qui s’inquiète ?');
  });

  it('sends a reader with no session back to the classroom mode', () => {
    saveSeance(null);
    renderAt('/classe/corrige');
    expect(screen.getByRole('heading', { level: 1, name: 'Aucune séance ouverte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le mode classe' })).toHaveAttribute('href', '/classe');
  });

  it('prints the guide on one page, with the terms it rests on', () => {
    renderAt('/classe/mode-emploi');
    const sheet = screen.getByRole('article', { name: 'Mode d’emploi' });
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(6);
    expect(sheet).toHaveTextContent('Le fichier de séance');
    expect(sheet).toHaveTextContent('L’écran étendu');
  });
});
