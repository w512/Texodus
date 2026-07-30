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

// Running a command twice must return the text to where it started, instead of
// stacking markers (`# # title`, `****bold****`).
describe('applyFormat toggles', () => {
  let view: EditorView;
  afterEach(() => destroyView(view));

  function select(doc: string, anchor: number, head: number): EditorView {
    view = makeView(doc);
    view.dispatch(view.state.update({ selection: { anchor, head } }));
    return view;
  }

  it('unwraps bold when the selection includes the markers', () => {
    select('**hello**', 0, 9);
    applyFormat('bold', view);
    expect(view.state.doc.toString()).toBe('hello');
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to))
      .toBe('hello');
  });

  it('unwraps bold when the markers sit around the selection', () => {
    select('**hello**', 2, 7);
    applyFormat('bold', view);
    expect(view.state.doc.toString()).toBe('hello');
  });

  it('round-trips bold: apply then remove', () => {
    select('hello', 0, 5);
    applyFormat('bold', view);
    expect(view.state.doc.toString()).toBe('**hello**');
    applyFormat('bold', view);
    expect(view.state.doc.toString()).toBe('hello');
  });

  it('unwraps inline code and strikethrough', () => {
    select('`x`', 0, 3);
    applyFormat('code', view);
    expect(view.state.doc.toString()).toBe('x');
    destroyView(view);

    select('~~x~~', 2, 3);
    applyFormat('strikethrough', view);
    expect(view.state.doc.toString()).toBe('x');
  });

  it('unwraps <u> markers around the selection', () => {
    select('<u>x</u>', 3, 4);
    applyFormat('underline', view);
    expect(view.state.doc.toString()).toBe('x');
  });

  // The `*` next to `**` belongs to the bold run — italic must add emphasis
  // here, not quietly downgrade bold to italic.
  it('does not strip bold markers when toggling italic', () => {
    select('**hello**', 2, 7);
    applyFormat('italic', view);
    expect(view.state.doc.toString()).toBe('***hello***');
    destroyView(view);

    select('**hello**', 0, 9);
    applyFormat('italic', view);
    expect(view.state.doc.toString()).toBe('***hello***');
  });

  it('still unwraps genuine italic markers', () => {
    select('*hello*', 1, 6);
    applyFormat('italic', view);
    expect(view.state.doc.toString()).toBe('hello');
  });

  it('toggles a heading off at the same level', () => {
    view = makeView('# title');
    view.dispatch(view.state.update({ selection: { anchor: 3 } }));
    applyFormat('heading1', view);
    expect(view.state.doc.toString()).toBe('title');
  });

  it('replaces a heading of another level instead of stacking', () => {
    view = makeView('# title');
    view.dispatch(view.state.update({ selection: { anchor: 3 } }));
    applyFormat('heading3', view);
    expect(view.state.doc.toString()).toBe('### title');
    applyFormat('heading3', view);
    expect(view.state.doc.toString()).toBe('title');
  });

  it('pressing a heading twice never yields "# # title"', () => {
    view = makeView('title');
    view.dispatch(view.state.update({ selection: { anchor: 0 } }));
    applyFormat('heading2', view);
    applyFormat('heading2', view);
    expect(view.state.doc.toString()).toBe('title');
  });

  it('paragraph clears heading, list and quote markers', () => {
    view = makeView('## title');
    view.dispatch(view.state.update({ selection: { anchor: 4 } }));
    applyFormat('paragraph', view);
    expect(view.state.doc.toString()).toBe('title');
    destroyView(view);

    view = makeView('- [ ] task');
    view.dispatch(view.state.update({ selection: { anchor: 7 } }));
    applyFormat('paragraph', view);
    expect(view.state.doc.toString()).toBe('task');
    destroyView(view);

    view = makeView('> quoted');
    view.dispatch(view.state.update({ selection: { anchor: 3 } }));
    applyFormat('paragraph', view);
    expect(view.state.doc.toString()).toBe('quoted');
  });

  it('swaps between list families rather than nesting markers', () => {
    view = makeView('- item');
    view.dispatch(view.state.update({ selection: { anchor: 3 } }));
    applyFormat('task_list', view);
    expect(view.state.doc.toString()).toBe('- [ ] item');
    applyFormat('ordered_list', view);
    expect(view.state.doc.toString()).toBe('1. item');
    applyFormat('list', view);
    expect(view.state.doc.toString()).toBe('- item');
    applyFormat('list', view);
    expect(view.state.doc.toString()).toBe('item');
  });

  it('toggles blockquote on and off, keeping the list marker', () => {
    view = makeView('- item');
    view.dispatch(view.state.update({ selection: { anchor: 3 } }));
    applyFormat('blockquote', view);
    expect(view.state.doc.toString()).toBe('> - item');
    applyFormat('blockquote', view);
    expect(view.state.doc.toString()).toBe('- item');
  });

  it('keeps indentation when toggling a nested list item', () => {
    view = makeView('  - nested');
    view.dispatch(view.state.update({ selection: { anchor: 6 } }));
    applyFormat('task_list', view);
    expect(view.state.doc.toString()).toBe('  - [ ] nested');
    applyFormat('task_list', view);
    expect(view.state.doc.toString()).toBe('  nested');
  });

  it('replaces the block marker inside a blockquote', () => {
    view = makeView('> - item');
    view.dispatch(view.state.update({ selection: { anchor: 5 } }));
    applyFormat('heading2', view);
    expect(view.state.doc.toString()).toBe('> ## item');
  });
});

describe('applyFormat over a multi-line selection', () => {
  let view: EditorView;
  afterEach(() => destroyView(view));

  function selectAll(doc: string): EditorView {
    view = makeView(doc);
    view.dispatch(view.state.update({ selection: { anchor: 0, head: doc.length } }));
    return view;
  }

  it('prefixes every selected line, not just the cursor line', () => {
    selectAll('one\ntwo\nthree');
    applyFormat('list', view);
    expect(view.state.doc.toString()).toBe('- one\n- two\n- three');
  });

  it('numbers an ordered list across the selection', () => {
    selectAll('one\ntwo\nthree');
    applyFormat('ordered_list', view);
    expect(view.state.doc.toString()).toBe('1. one\n2. two\n3. three');
  });

  it('removes the marker from every line when all lines already have it', () => {
    selectAll('- one\n- two');
    applyFormat('list', view);
    expect(view.state.doc.toString()).toBe('one\ntwo');
  });

  it('applies to all lines when only some already carry the marker', () => {
    selectAll('- one\ntwo');
    applyFormat('list', view);
    expect(view.state.doc.toString()).toBe('- one\n- two');
  });

  it('skips blank lines inside the selection', () => {
    selectAll('one\n\ntwo');
    applyFormat('blockquote', view);
    expect(view.state.doc.toString()).toBe('> one\n\n> two');
  });

  it('keeps the selection covering the same text', () => {
    selectAll('one\ntwo');
    applyFormat('heading1', view);
    expect(view.state.doc.toString()).toBe('# one\n# two');
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe('# one\n# two');
  });

  it('headings toggle off across the selection', () => {
    selectAll('# one\n# two');
    applyFormat('heading1', view);
    expect(view.state.doc.toString()).toBe('one\ntwo');
  });

  it('ignores a trailing line the selection only touches at column 0', () => {
    view = makeView('one\ntwo');
    // 'one\n' selected: the second line isn't visibly part of the selection.
    view.dispatch(view.state.update({ selection: { anchor: 0, head: 4 } }));
    applyFormat('list', view);
    expect(view.state.doc.toString()).toBe('- one\ntwo');
  });

  it('handles a selection dragged backwards', () => {
    view = makeView('one\ntwo');
    // anchor after head: selection made from the end upwards.
    view.dispatch(view.state.update({ selection: { anchor: 7, head: 0 } }));
    applyFormat('list', view);
    expect(view.state.doc.toString()).toBe('- one\n- two');
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe('- one\n- two');
  });
});