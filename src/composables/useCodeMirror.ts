/**
 * CodeMirror 6 setup for the markdown editor. Owns:
 *   - Markdown syntax highlighting (via lang-markdown + lezer-markdown)
 *   - Lazy-loaded language support for fenced code blocks (language-data)
 *   - Bracket pair auto-close + matching
 *   - Smart list continuation on Enter (custom keymap, see continueList)
 *   - Reactive theme/font via Compartments so the editor reconfigures in
 *     place when settings change (no rebuild required).
 *
 * The view's lifecycle is managed by TextEditor.vue; this module exposes
 * pure factory + theme functions.
 */
import { EditorState, Compartment, EditorSelection } from '@codemirror/state';
import {
  EditorView,
  keymap,
  highlightActiveLine,
  drawSelection,
  dropCursor,
} from '@codemirror/view';
import type { KeyBinding } from '@codemirror/view';
import {
  history,
  defaultKeymap,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentUnit,
} from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';

// ── Smart list continuation ───────────────────────────────────────────────
// Matches a list line: indent + optional blockquote prefix(es) + bullet
// (- * + or N. N)) + optional task checkbox. Group capture is used in
// continueList() to reconstruct the next line's marker.
const LIST_MARKER = /^(\s*(?:>\s*)*)([-*+]\s|\d+[.)]\s)(\[[ xX]\]\s)?/;

function continueList(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;

  const line = state.doc.lineAt(sel.head);
  const m = LIST_MARKER.exec(line.text);
  if (!m) return false;

  const [whole, indent, bullet, task = ''] = m;
  const cursorCol = sel.head - line.from;

  // Marker but no content + cursor at end → user wants out of the list.
  if (line.text === whole && cursorCol === whole.length) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: '' },
      selection: EditorSelection.cursor(line.from),
    });
    return true;
  }

  // Increment ordered list number; reset task checkbox to unchecked.
  const ordered = /^(\d+)([.)])(\s)$/.exec(bullet);
  const nextBullet = ordered
    ? `${parseInt(ordered[1], 10) + 1}${ordered[2]}${ordered[3]}`
    : bullet;
  const nextTask = task ? '[ ] ' : '';

  const insert = `\n${indent}${nextBullet}${nextTask}`;
  view.dispatch({
    changes: { from: sel.head, to: sel.head, insert },
    selection: EditorSelection.cursor(sel.head + insert.length),
  });
  return true;
}

const continueListKeymap: KeyBinding[] = [
  { key: 'Enter', run: continueList },
];

// ── Theme / font compartments ─────────────────────────────────────────────
// Compartments let us live-reconfigure single extensions without rebuilding
// the entire EditorState — see https://codemirror.net/docs/ref/#state.Compartment

const themeCompartment = new Compartment();
const fontCompartment = new Compartment();

export interface ThemeOpts {
  dark: boolean;
  font: string;
  fontSize: number;
}

function buildTheme(opts: ThemeOpts) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        background: 'transparent',
        color: 'var(--text-color)',
      },
      '.cm-scroller': {
        fontFamily: opts.font,
        fontSize: opts.fontSize + 'px',
        lineHeight: '1.75',
        padding: '2rem 2.5rem',
        overflowY: 'auto',
      },
      '.cm-content': {
        padding: '0',
        caretColor: 'var(--accent-color)',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-line': {
        padding: '0',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--accent-color)',
      },
      '&.cm-focused .cm-selectionBackground, ::selection': {
        background: 'var(--selection-bg, rgba(37, 99, 235, 0.22))',
      },
      '.cm-activeLine': {
        background: 'var(--active-line-bg, transparent)',
      },
      '.cm-gutters': { display: 'none' },
    },
    { dark: opts.dark },
  );
}

// ── Editor factory ────────────────────────────────────────────────────────

export interface CreateStateOpts {
  initialDoc: string;
  theme: ThemeOpts;
  onChange: (value: string) => void;
  onScroll: () => void;
}

export interface CreateEditorOpts extends CreateStateOpts {
  parent: HTMLElement;
}

/**
 * Builds a fresh EditorState carrying all the editor's extensions. Exposed
 * separately from createMarkdownEditor so callers can pre-build states for
 * inactive tabs and swap them into a single view via `view.setState(...)`.
 */
export function createMarkdownState(opts: CreateStateOpts): EditorState {
  return EditorState.create({
    doc: opts.initialDoc,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      highlightActiveLine(),
      bracketMatching(),
      closeBrackets(),
      EditorState.allowMultipleSelections.of(true),
      EditorView.lineWrapping,
      indentUnit.of('  '),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
        ...continueListKeymap,
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      themeCompartment.of(buildTheme(opts.theme)),
      fontCompartment.of([]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) opts.onChange(u.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        scroll: () => {
          opts.onScroll();
          return false;
        },
      }),
    ],
  });
}

export function createMarkdownEditor(opts: CreateEditorOpts): EditorView {
  return new EditorView({ parent: opts.parent, state: createMarkdownState(opts) });
}

export function reconfigureTheme(view: EditorView, theme: ThemeOpts): void {
  view.dispatch({
    effects: themeCompartment.reconfigure(buildTheme(theme)),
  });
}

/**
 * Applies a theme reconfiguration to a detached state (e.g. one cached for an
 * inactive tab). Returns the new state — caller must re-store it.
 */
export function reconfigureThemeOnState(state: EditorState, theme: ThemeOpts): EditorState {
  return state.update({
    effects: themeCompartment.reconfigure(buildTheme(theme)),
  }).state;
}
