import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { applyFormat } from './useFormatting';

function makeView(doc = ''): EditorView {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return new EditorView({
    state: EditorState.create({ doc }),
    parent: div,
  });
}

function destroyView(view: EditorView) {
  view.destroy();
  view.dom.remove();
}

describe('applyFormat', () => {
  let view: EditorView;

  beforeEach(() => {
    view = makeView();
  });

  afterEach(() => {
    destroyView(view);
  });

  it('does nothing when view is null', () => {
    expect(() => applyFormat('bold', null)).not.toThrow();
  });

  it('wraps selection with ** for bold', () => {
    view.dispatch(view.state.update({
      changes: { from: 0, to: 0, insert: 'hello' },
      selection: { anchor: 0, head: 5 },
    }));
    applyFormat('bold', view);
    expect(view.state.doc.toString()).toBe('**hello**');
  });

  it('uses default text when nothing is selected', () => {
    applyFormat('bold', view);
    expect(view.state.doc.toString()).toBe('**bold text**');
    // selection should be inside the markers, around the default text
    expect(view.state.selection.main.from).toBe(2);
    expect(view.state.selection.main.to).toBe(11);
  });

  it('wraps with * for italic', () => {
    applyFormat('italic', view);
    expect(view.state.doc.toString()).toBe('*italic text*');
  });

  it('wraps with ~~ for strikethrough', () => {
    applyFormat('strikethrough', view);
    expect(view.state.doc.toString()).toBe('~~strikethrough~~');
  });

  it('wraps with backticks for code', () => {
    applyFormat('code', view);
    expect(view.state.doc.toString()).toBe('`code`');
  });

  it('creates a link with placeholder', () => {
    applyFormat('link', view);
    expect(view.state.doc.toString()).toBe('[link text](https://)');
  });

  it('creates an image with placeholder', () => {
    applyFormat('image', view);
    expect(view.state.doc.toString()).toBe('![image description](https://)');
  });

  it('prepends - for list', () => {
    view = makeView('first line\nsecond line');
    // cursor at start of first line
    view.dispatch(view.state.update({ selection: { anchor: 0 } }));
    applyFormat('list', view);
    expect(view.state.doc.toString()).toBe('- first line\nsecond line');
  });

  it('prepends 1. for ordered list', () => {
    view = makeView('item');
    view.dispatch(view.state.update({ selection: { anchor: 0 } }));
    applyFormat('ordered_list', view);
    expect(view.state.doc.toString()).toBe('1. item');
  });

  it('prepends - [ ] for task list', () => {
    view = makeView('task');
    view.dispatch(view.state.update({ selection: { anchor: 0 } }));
    applyFormat('task_list', view);
    expect(view.state.doc.toString()).toBe('- [ ] task');
  });

  it('prepends > for blockquote', () => {
    view = makeView('quote');
    view.dispatch(view.state.update({ selection: { anchor: 0 } }));
    applyFormat('blockquote', view);
    expect(view.state.doc.toString()).toBe('> quote');
  });

  it('prepends # for heading1', () => {
    view = makeView('title');
    view.dispatch(view.state.update({ selection: { anchor: 0 } }));
    applyFormat('heading1', view);
    expect(view.state.doc.toString()).toBe('# title');
  });

  it('prepends ## for heading2', () => {
    view = makeView('title');
    view.dispatch(view.state.update({ selection: { anchor: 0 } }));
    applyFormat('heading2', view);
    expect(view.state.doc.toString()).toBe('## title');
  });

  it('prepends ### for heading3', () => {
    view = makeView('title');
    view.dispatch(view.state.update({ selection: { anchor: 0 } }));
    applyFormat('heading3', view);
    expect(view.state.doc.toString()).toBe('### title');
  });

  it('is a no-op for an unknown format', () => {
    view = makeView('unchanged');
    applyFormat('nonexistent_format', view);
    expect(view.state.doc.toString()).toBe('unchanged');
  });
});