/**
 * Minimal top-level DOM patching for the markdown preview (§6.2).
 *
 * The preview re-renders the whole document to an HTML string on every
 * (debounced) edit. Swapping it in via `innerHTML` rebuilds every block —
 * discarding Prism work, rebuilding mermaid diagrams (losing their zoom/pan
 * state) and thrashing layout on large documents. Instead the previous
 * render's per-node serialization is compared with the new one and only the
 * changed span of top-level nodes is swapped.
 *
 * Comparison runs against the *stored* serialization of the previous render,
 * not the live DOM: post-render passes (mermaid swap-in, Prism token spans,
 * image src rewriting, `data-source-line` anchors) mutate nodes in place —
 * always 1:1, never changing count or order — so index alignment with the
 * stored strings holds, while live `outerHTML` would spuriously differ
 * everywhere. This is also what keeps an *unchanged* mermaid block alive:
 * its stored string is the original `<pre>`, matching the new render even
 * though the live node is the swapped-in diagram container.
 */

/** Stable string form of a top-level preview node, computed at render time
 *  (before any post-render DOM mutation). */
export function serializeNode(node: Node): string {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).outerHTML;
  // Text/comment nodes (e.g. the "\n" between marked's blocks, or text left
  // over when the sanitizer strips an unknown tag).
  return `#${node.nodeName}:${node.textContent ?? ''}`;
}

/**
 * Replaces only the top-level child span of `container` whose serialization
 * changed. `prevSerialized` must align 1:1 with `container.childNodes`; when
 * it doesn't (unexpected external mutation), falls back to a full swap.
 * `newNodes`/`newSerialized` come from the freshly parsed render.
 */
export function patchChildren(
  container: HTMLElement,
  newNodes: Node[],
  newSerialized: string[],
  prevSerialized: string[],
): void {
  const oldNodes = Array.from(container.childNodes);

  if (prevSerialized.length !== oldNodes.length) {
    container.replaceChildren(...newNodes);
    return;
  }

  // Trim the common prefix and suffix; only the middle span differs. A block
  // edited in place, inserted, or deleted all reduce to a minimal range.
  let start = 0;
  const maxStart = Math.min(oldNodes.length, newNodes.length);
  while (start < maxStart && prevSerialized[start] === newSerialized[start]) start++;

  let endOld = oldNodes.length - 1;
  let endNew = newNodes.length - 1;
  while (endOld >= start && endNew >= start && prevSerialized[endOld] === newSerialized[endNew]) {
    endOld--;
    endNew--;
  }

  const anchor = endOld + 1 < oldNodes.length ? oldNodes[endOld + 1] : null;
  for (let i = start; i <= endOld; i++) container.removeChild(oldNodes[i]);
  for (const node of newNodes.slice(start, endNew + 1)) container.insertBefore(node, anchor);
}
