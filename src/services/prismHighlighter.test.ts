import { describe, expect, it } from 'vitest';
import { ensurePrismLanguages, highlightUnder } from './prismHighlighter';

function makeContainer(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('prismHighlighter', () => {
  it('loads a non-core language component on demand and highlights', async () => {
    const container = makeContainer(
      '<pre><code class="language-python">def foo():\n    return 1</code></pre>',
    );
    await ensurePrismLanguages(container);
    highlightUnder(container);
    expect(container.querySelector('.token.keyword')?.textContent).toBe('def');
  });

  it('resolves fence aliases the component does not register itself', async () => {
    const container = makeContainer(
      '<pre><code class="language-zsh">echo "hi"</code></pre>',
    );
    await ensurePrismLanguages(container);
    highlightUnder(container);
    expect(container.querySelector('.token.string')).not.toBeNull();
  });

  it('loads dependency chains (tsx → jsx + typescript)', async () => {
    const container = makeContainer(
      '<pre><code class="language-tsx">const x: number = 1;</code></pre>',
    );
    await ensurePrismLanguages(container);
    highlightUnder(container);
    expect(container.querySelector('.token.keyword')).not.toBeNull();
  });

  it('leaves unknown languages unhighlighted without throwing', async () => {
    const container = makeContainer(
      '<pre><code class="language-nosuchlang">plain text</code></pre>',
    );
    await ensurePrismLanguages(container);
    highlightUnder(container);
    expect(container.querySelector('.token')).toBeNull();
    expect(container.textContent).toContain('plain text');
  });

  it('still highlights core languages without extra components', async () => {
    const container = makeContainer(
      '<pre><code class="language-javascript">const x = 1;</code></pre>',
    );
    await ensurePrismLanguages(container);
    highlightUnder(container);
    expect(container.querySelector('.token.keyword')?.textContent).toBe('const');
  });
});
