declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, unknown>;
  export default component;
}

declare module 'prismjs' {
  const Prism: {
    highlightAllUnder: (root: Element | Document) => void;
    highlightAll: () => void;
    /** Registered grammars; used to check whether a component is loaded and
     *  to register fence-name aliases (services/prismHighlighter.ts). */
    languages: Record<string, unknown>;
  };
  export default Prism;
}

// Per-language Prism components, loaded on demand by services/prismHighlighter.ts.
declare module 'prismjs/components/prism-*';

