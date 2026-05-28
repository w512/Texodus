/**
 * Markdown formatting helpers driving the CodeMirror EditorView.
 * Used by both KeyboardShortcuts (Cmd+B, Cmd+I, …) and the format menu
 * dispatched via App.vue.
 */
import { EditorSelection } from '@codemirror/state';
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

function prependLine(view: EditorView, prefix: string): void {
  const cursor = view.state.selection.main.head;
  const line = view.state.doc.lineAt(cursor);

  view.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
    selection: EditorSelection.cursor(cursor + prefix.length),
  });
  view.focus();
}

export function applyFormat(format: string, view: EditorView | null): void {
  if (!view) return;
  switch (format) {
    case 'bold':           wrapSelection(view, '**', '**', 'bold text'); break;
    case 'italic':         wrapSelection(view, '*', '*', 'italic text'); break;
    case 'underline':      wrapSelection(view, '<u>', '</u>', 'underline text'); break;
    case 'strikethrough':  wrapSelection(view, '~~', '~~', 'strikethrough'); break;
    case 'link':           wrapSelection(view, '[', '](https://)', 'link text'); break;
    case 'image':          wrapSelection(view, '![', '](https://)', 'image description'); break;
    case 'table':          wrapSelection(view, '\n| Column 1 | Column 2 |\n| -------- | -------- |\n| Text     | Text     |\n', '', ''); break;
    case 'list':           prependLine(view, '- '); break;
    case 'ordered_list':   prependLine(view, '1. '); break;
    case 'task_list':      prependLine(view, '- [ ] '); break;
    case 'blockquote':     prependLine(view, '> '); break;
    case 'code':           wrapSelection(view, '`', '`', 'code'); break;
    case 'block_code':     wrapSelection(view, '\n```\n', '\n```\n', 'code block'); break;
    case 'inline_math':    wrapSelection(view, '$', '$', 'x'); break;
    case 'block_math':     wrapSelection(view, '\n$$\n', '\n$$\n', 'x = y'); break;
    case 'heading1':       prependLine(view, '# '); break;
    case 'heading2':       prependLine(view, '## '); break;
    case 'heading3':       prependLine(view, '### '); break;
    case 'heading4':       prependLine(view, '#### '); break;
    case 'heading5':       prependLine(view, '##### '); break;
    case 'heading6':       prependLine(view, '###### '); break;
    case 'heading':        prependLine(view, '## '); break; // Legacy fallback
    case 'paragraph':      wrapSelection(view, '\n\n', '', ''); break;
    case 'horizontal_rule': wrapSelection(view, '\n\n---\n\n', '', ''); break;
  }
}
