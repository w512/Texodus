import { describe, expect, it } from 'vitest';
import { patchChildren, serializeNode } from './domPatch';

function mount(html: string): { container: HTMLElement; serialized: string[] } {
  const container = document.createElement('div');
  container.innerHTML = html;
  return { container, serialized: Array.from(container.childNodes).map(serializeNode) };
}

function parse(html: string): { nodes: Node[]; serialized: string[] } {
  const template = document.createElement('template');
  template.innerHTML = html;
  const nodes = Array.from(template.content.childNodes);
  return { nodes, serialized: nodes.map(serializeNode) };
}

describe('patchChildren', () => {
  it('replaces only the changed block, keeping sibling node identities', () => {
    const { container, serialized } = mount('<p>a</p><p>b</p><p>c</p>');
    const [first, , third] = Array.from(container.children);
    const next = parse('<p>a</p><p>B!</p><p>c</p>');
    patchChildren(container, next.nodes, next.serialized, serialized);
    expect(container.children[0]).toBe(first);
    expect(container.children[2]).toBe(third);
    expect(container.children[1].textContent).toBe('B!');
  });

  it('keeps everything when nothing changed', () => {
    const { container, serialized } = mount('<p>a</p><p>b</p>');
    const originals = Array.from(container.children);
    const next = parse('<p>a</p><p>b</p>');
    patchChildren(container, next.nodes, next.serialized, serialized);
    expect(Array.from(container.children)).toEqual(originals);
  });

  it('inserts a middle block without touching the suffix', () => {
    const { container, serialized } = mount('<p>a</p><p>c</p>');
    const last = container.children[1];
    const next = parse('<p>a</p><p>b</p><p>c</p>');
    patchChildren(container, next.nodes, next.serialized, serialized);
    expect(container.children).toHaveLength(3);
    expect(container.children[1].textContent).toBe('b');
    expect(container.children[2]).toBe(last);
  });

  it('deletes a middle block', () => {
    const { container, serialized } = mount('<p>a</p><p>b</p><p>c</p>');
    const next = parse('<p>a</p><p>c</p>');
    patchChildren(container, next.nodes, next.serialized, serialized);
    expect(container.innerHTML).toBe('<p>a</p><p>c</p>');
  });

  it('handles append and full clear', () => {
    const a = mount('<p>a</p>');
    const grown = parse('<p>a</p><p>b</p>');
    patchChildren(a.container, grown.nodes, grown.serialized, a.serialized);
    expect(a.container.innerHTML).toBe('<p>a</p><p>b</p>');

    const b = mount('<p>a</p><p>b</p>');
    const empty = parse('');
    patchChildren(b.container, empty.nodes, empty.serialized, b.serialized);
    expect(b.container.innerHTML).toBe('');
  });

  it('keeps a node that a post-render pass swapped in place (mermaid-style)', () => {
    // Stored serialization still says <pre>…</pre>, but the live node was
    // replaced by a rendered diagram container. An unchanged source block
    // must keep the container; only the edited sibling is replaced.
    const { container, serialized } = mount('<pre>graph TD</pre><p>t</p>');
    const diagram = document.createElement('div');
    diagram.className = 'diagram';
    container.firstElementChild!.replaceWith(diagram);

    const next = parse('<pre>graph TD</pre><p>t2</p>');
    patchChildren(container, next.nodes, next.serialized, serialized);
    expect(container.firstElementChild).toBe(diagram);
    expect(container.children[1].textContent).toBe('t2');
  });

  it('preserves top-level text nodes between blocks', () => {
    const { container, serialized } = mount('<p>a</p>\n<p>b</p>');
    const next = parse('<p>a</p>\n<p>B</p>');
    patchChildren(container, next.nodes, next.serialized, serialized);
    expect(container.childNodes).toHaveLength(3);
    expect(container.childNodes[1].nodeType).toBe(Node.TEXT_NODE);
    expect(container.children[1].textContent).toBe('B');
  });

  it('falls back to a full swap when the stored serialization is stale', () => {
    const { container } = mount('<p>a</p><p>b</p>');
    const next = parse('<p>x</p>');
    patchChildren(container, next.nodes, next.serialized, ['<p>a</p>']); // wrong length
    expect(container.innerHTML).toBe('<p>x</p>');
  });
});
