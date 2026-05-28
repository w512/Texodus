declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, unknown>;
  export default component;
}

declare module 'prismjs' {
  const Prism: {
    highlightAllUnder: (root: Element | Document) => void;
    highlightAll: () => void;
  };
  export default Prism;
}

