/**
 * Markdown formatting helpers driving the CodeMirror EditorView.
 * Used by both KeyboardShortcuts (Cmd+B, Cmd+I, …) and the format menu
 * dispatched via App.vue.
 *
 * Two families of commands, and both are **toggles** — running the same command
 * twice returns the text to where it started:
 *
 *   - inline wraps (bold, italic, code, …) → `toggleWrap`
 *   - line prefixes (headings, lists, quote) → `applyLinePrefix`, which applies
 *     to *every* line the selection touches, not just the cursor's line
 *
 * Insertions that aren't toggles by nature (link, image, table, horizontal rule)
 * still go through the plain `wrapSelection`.
 */
import { EditorSelection, type ChangeSpec, type Line } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  defaultText = '',
): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to) || defaultText;
  const insert = before + selected + after;

  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(
      from + before.length,
      from + before.length + selected.length,
    ),
  });
  view.focus();
}

// ── Inline wraps ──────────────────────────────────────────────────────────────

/**
 * The character a marker is a run of (`*`, `**`, `~~`, `` ` ``), or null for
 * mixed markers like `<u>`. Runs are ambiguous across nesting levels: the `*`
 * adjacent to `**` belongs to the bold run, so italic must not "unwrap" it and
 * silently turn **bold** into *italic*.
 */
function runCharOf(marker: string): string | null {
  if (!marker) return null;
  const ch = marker[0];
  return [...marker].every((c) => c === ch) ? ch : null;
}

/**
 * Wraps the selection in `before`/`after` — or removes those markers when they
 * are already there, whether they sit inside the selection (`**text**` selected
 * whole) or around it (`text` selected inside `**text**`).
 */
function toggleWrap(
  view: EditorView,
  before: string,
  after: string,
  defaultText = '',
): void {
  const { state } = view;
  const { from, to } = state.selection.main;

  if (from !== to) {
    const selected = state.sliceDoc(from, to);
    const runChar = runCharOf(before);

    // Markers inside the selection: `**text**` → `text`.
    if (
      selected.length >= before.length + after.length
      && selected.startsWith(before)
      && selected.endsWith(after)
      // A longer run of the same character is a different emphasis level:
      // italic over a selected `**text**` adds emphasis, it doesn't strip bold.
      && !(runChar && selected[before.length] === runChar)
    ) {
      const inner = selected.slice(before.length, selected.length - after.length);
      view.dispatch({
        changes: { from, to, insert: inner },
        selection: EditorSelection.range(from, from + inner.length),
      });
      view.focus();
      return;
    }

    // Markers around the selection: `**[text]**` → `[text]`.
    const markerStart = from - before.length;
    const markerEnd = to + after.length;
    if (
      markerStart >= 0
      && markerEnd <= state.doc.length
      && state.sliceDoc(markerStart, from) === before
      && state.sliceDoc(to, markerEnd) === after
      && !(runChar && markerStart > 0 && state.sliceDoc(markerStart - 1, markerStart) === runChar)
    ) {
      view.dispatch({
        changes: [
          { from: markerStart, to: from, insert: '' },
          { from: to, to: markerEnd, insert: '' },
        ],
        selection: EditorSelection.range(markerStart, markerStart + selected.length),
      });
      view.focus();
      return;
    }
  }

  wrapSelection(view, before, after, defaultText);
}

// ── Line prefixes ─────────────────────────────────────────────────────────────

type BlockKind = 'heading' | 'bullet' | 'ordered' | 'task';

/** Existing block markers, tested in order: a task item (`- [x] `) also matches
 *  the plain bullet pattern, so it has to come first. */
const BLOCK_PATTERNS: { kind: BlockKind; re: RegExp }[] = [
  { kind: 'task',    re: /^[-*+][ \t]+\[[ xX]\][ \t]+/ },
  { kind: 'bullet',  re: /^[-*+][ \t]+/ },
  { kind: 'ordered', re: /^\d+[.)][ \t]+/ },
  { kind: 'heading', re: /^#{1,6}[ \t]+/ },
];

/** Indentation plus any blockquote markers — structural context that stays put
 *  while the block marker after it is toggled (`> - item` → `> # item`). */
const LINE_CONTEXT = /^([ \t]*)((?:>[ \t]?)*)/;

interface LineParts {
  /** Offset from the line start where the block marker begins. */
  markerStart: number;
  /** The block marker currently there (`''` when the line is plain). */
  marker: string;
  kind: BlockKind | null;
  /** Length of the leading blockquote run (`0` when not quoted). */
  quoteLength: number;
  indentLength: number;
}

function parseLine(text: string): LineParts {
  const [context, indent, quote] = LINE_CONTEXT.exec(text) as RegExpExecArray;
  const rest = text.slice(context.length);
  for (const { kind, re } of BLOCK_PATTERNS) {
    const m = re.exec(rest);
    if (m) return {
      markerStart: context.length,
      marker: m[0],
      kind,
      quoteLength: quote.length,
      indentLength: indent.length,
    };
  }
  return {
    markerStart: context.length,
    marker: '',
    kind: null,
    quoteLength: quote.length,
    indentLength: indent.length,
  };
}

type LinePrefixCommand =
  | { kind: 'heading'; level: number }
  | { kind: 'bullet' }
  | { kind: 'ordered' }
  | { kind: 'task' }
  | { kind: 'quote' }
  /** "Paragraph": strip every block marker, leaving plain text. */
  | { kind: 'clear' };

/** The marker this command writes. `index` numbers ordered lists across a
 *  multi-line selection. */
function markerFor(command: LinePrefixCommand, index: number): string {
  switch (command.kind) {
    case 'heading': return `${'#'.repeat(command.level)} `;
    case 'bullet':  return '- ';
    case 'ordered': return `${index + 1}. `;
    case 'task':    return '- [ ] ';
    default:        return '';
  }
}

/** True when the line already carries exactly what `command` would write, i.e.
 *  running the command again should remove it. */
function alreadyApplied(command: LinePrefixCommand, parts: LineParts): boolean {
  switch (command.kind) {
    case 'heading':
      return parts.kind === 'heading' && parts.marker.replace(/[^#]/g, '').length === command.level;
    case 'bullet':
    case 'ordered':
    case 'task':
      return parts.kind === command.kind;
    case 'quote':
      return parts.quoteLength > 0;
    case 'clear':
      return false;
  }
}

/**
 * Shifts `pos` through `edits` (disjoint, ascending). A position that sat inside
 * a replaced marker snaps to just after whatever replaced it.
 *
 * `assoc` decides where a pure insertion landing exactly on `pos` leaves it:
 * `'after'` for a caret (it should ride along with the text it was in front of)
 * and for the end of a range, `'before'` for the start of a range (so a
 * selected line stays fully selected, prefix included).
 */
function mapPosition(
  pos: number,
  edits: { from: number; to: number; insert: string }[],
  assoc: 'before' | 'after',
): number {
  let shift = 0;
  for (const edit of edits) {
    if (edit.to <= pos) {
      const insertionAtPos = edit.from === edit.to && edit.to === pos;
      if (insertionAtPos && assoc === 'before') break;
      shift += edit.insert.length - (edit.to - edit.from);
      continue;
    }
    if (edit.from < pos) return edit.from + shift + edit.insert.length;
    break;
  }
  return pos + shift;
}

/**
 * Applies (or removes) a line-level marker on every line the selection touches.
 *
 * Toggling off happens when *all* affected lines already carry that exact marker
 * — so a second Cmd+1 unwraps the heading instead of producing `# # title`.
 * Otherwise the marker is written, replacing any existing marker of the block
 * families it competes with (a heading replaces a list bullet and vice versa;
 * blockquote nests around whatever is there).
 */
function applyLinePrefix(view: EditorView, command: LinePrefixCommand): void {
  const { state } = view;
  const selection = state.selection.main;
  const firstLine = state.doc.lineAt(selection.from);
  const lastLine = state.doc.lineAt(selection.to);

  // A selection that ends exactly at a line start (dragged one line too far,
  // e.g. "one\n" in "one\ntwo") doesn't visibly include that line — don't
  // prefix it.
  const endsAtLineStart = !selection.empty
    && selection.to === lastLine.from
    && lastLine.number > firstLine.number;
  const lastNumber = endsAtLineStart ? lastLine.number - 1 : lastLine.number;

  const lines: Line[] = [];
  for (let n = firstLine.number; n <= lastNumber; n++) lines.push(state.doc.line(n));
  // Blank lines in a multi-line selection aren't list items or headings; a
  // single (possibly empty) line is always the target.
  const targets = lines.length > 1 ? lines.filter((line) => line.text.trim() !== '') : lines;
  if (targets.length === 0) return;

  const removing = command.kind === 'clear'
    || targets.every((line) => alreadyApplied(command, parseLine(line.text)));

  const edits: { from: number; to: number; insert: string }[] = [];
  targets.forEach((line, index) => {
    const parts = parseLine(line.text);

    if (command.kind === 'quote') {
      const from = line.from + parts.indentLength;
      if (removing) {
        if (parts.quoteLength > 0) edits.push({ from, to: from + parts.quoteLength, insert: '' });
      } else {
        edits.push({ from, to: from, insert: '> ' });
      }
      return;
    }

    // 'clear' also drops the blockquote run; the other commands keep it as
    // context and only rewrite the marker that follows it.
    const from = command.kind === 'clear'
      ? line.from + parts.indentLength
      : line.from + parts.markerStart;
    const to = line.from + parts.markerStart + parts.marker.length;
    const insert = removing ? '' : markerFor(command, index);
    if (from === to && insert === '') return; // nothing there to remove
    edits.push({ from, to, insert });
  });

  if (edits.length === 0) return;

  // Keep the range over the same text (prefixes included); a bare caret rides
  // along with the text it sits in front of.
  const forward = selection.anchor <= selection.head;
  view.dispatch({
    changes: edits as ChangeSpec[],
    selection: selection.empty
      ? EditorSelection.cursor(mapPosition(selection.head, edits, 'after'))
      : EditorSelection.range(
        mapPosition(selection.anchor, edits, forward ? 'before' : 'after'),
        mapPosition(selection.head, edits, forward ? 'after' : 'before'),
      ),
  });
  view.focus();
}

export function applyFormat(format: string, view: EditorView | null): void {
  if (!view) return;
  switch (format) {
    case 'bold':           toggleWrap(view, '**', '**', 'bold text'); break;
    case 'italic':         toggleWrap(view, '*', '*', 'italic text'); break;
    case 'underline':      toggleWrap(view, '<u>', '</u>', 'underline text'); break;
    case 'strikethrough':  toggleWrap(view, '~~', '~~', 'strikethrough'); break;
    case 'code':           toggleWrap(view, '`', '`', 'code'); break;
    case 'block_code':     toggleWrap(view, '\n```\n', '\n```\n', 'code block'); break;
    // Not toggles: each run inserts a fresh snippet.
    case 'link':           wrapSelection(view, '[', '](https://)', 'link text'); break;
    case 'image':          wrapSelection(view, '![', '](https://)', 'image description'); break;
    case 'table':          wrapSelection(view, '\n| Column 1 | Column 2 |\n| -------- | -------- |\n| Text     | Text     |\n', '', ''); break;
    case 'horizontal_rule': wrapSelection(view, '\n\n---\n\n', '', ''); break;
    case 'list':           applyLinePrefix(view, { kind: 'bullet' }); break;
    case 'ordered_list':   applyLinePrefix(view, { kind: 'ordered' }); break;
    case 'task_list':      applyLinePrefix(view, { kind: 'task' }); break;
    case 'blockquote':     applyLinePrefix(view, { kind: 'quote' }); break;
    case 'heading1':       applyLinePrefix(view, { kind: 'heading', level: 1 }); break;
    case 'heading2':       applyLinePrefix(view, { kind: 'heading', level: 2 }); break;
    case 'heading3':       applyLinePrefix(view, { kind: 'heading', level: 3 }); break;
    case 'heading4':       applyLinePrefix(view, { kind: 'heading', level: 4 }); break;
    case 'heading5':       applyLinePrefix(view, { kind: 'heading', level: 5 }); break;
    case 'heading6':       applyLinePrefix(view, { kind: 'heading', level: 6 }); break;
    case 'paragraph':      applyLinePrefix(view, { kind: 'clear' }); break;
  }
}
