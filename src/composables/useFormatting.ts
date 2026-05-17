/**
 * Markdown formatting helpers for the editor textarea.
 * Used by both KeyboardShortcuts and Toolbar via App.vue.
 */
import { nextTick } from 'vue';
import { useEditorStore } from '../stores/editor';

async function wrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  defaultText = ''
): Promise<void> {
  const store = useEditorStore();
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const content = store.content;
  const selected = content.substring(start, end) || defaultText;

  store.updateContent(
    content.substring(0, start) + before + selected + after + content.substring(end)
  );

  await nextTick();
  textarea.focus();
  const newStart = start + before.length;
  textarea.setSelectionRange(newStart, newStart + selected.length);
}

async function prependLine(textarea: HTMLTextAreaElement, prefix: string): Promise<void> {
  const store = useEditorStore();
  const start = textarea.selectionStart;
  const content = store.content;
  const lineStart = content.lastIndexOf('\n', start - 1) + 1;

  store.updateContent(content.substring(0, lineStart) + prefix + content.substring(lineStart));

  await nextTick();
  textarea.focus();
  const cursor = start + prefix.length;
  textarea.setSelectionRange(cursor, cursor);
}

export function applyFormat(format: string, textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return;
  switch (format) {
    case 'bold':    wrapSelection(textarea, '**', '**', 'bold text'); break;
    case 'italic':  wrapSelection(textarea, '*', '*', 'italic text'); break;
    case 'code':    wrapSelection(textarea, '`', '`', 'code'); break;
    case 'link':    wrapSelection(textarea, '[', '](https://)', 'link text'); break;
    case 'heading': prependLine(textarea, '## '); break;
    case 'list':    prependLine(textarea, '- '); break;
  }
}
