/**
 * Lazy Prism singleton for the preview pane (§6.2).
 *
 * The `prismjs` core entry ships only markup/css/clike/javascript, while the
 * editor pane lazy-loads full language support via @codemirror/language-data.
 * To keep the panes consistent this module loads Prism language components on
 * demand, based on the `language-*` classes actually present in the rendered
 * DOM. Unknown languages simply stay unhighlighted.
 *
 * Split into two calls so MarkdownPreview's render pipeline can re-check its
 * generation guard between the (async) loading and the (sync) DOM mutation:
 *   await ensurePrismLanguages(container)  → loads core + css + components
 *   highlightUnder(container)              → applies the highlight
 */
import type Prism from 'prismjs';

type PrismInstance = typeof Prism;

let prism: PrismInstance | null = null;
let prismPromise: Promise<PrismInstance> | null = null;

function loadPrismCore(): Promise<PrismInstance> {
  if (!prismPromise) {
    prismPromise = Promise.all([
      import('prismjs'),
      import('../themes/prism.css'),
    ]).then(([mod]) => {
      prism = mod.default;
      return prism;
    });
  }
  return prismPromise;
}

// Maps common fence-info aliases to the Prism component that implements them.
// Most components register their own runtime aliases (py, ts, sh, yml, …);
// ensureLanguage additionally aliases the raw fence name after loading, so
// the ones they don't cover (zsh, c++, golang, …) still highlight.
const LANGUAGE_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  'cs': 'csharp',
  'dockerfile': 'docker',
  'golang': 'go',
  'hs': 'haskell',
  'html': 'markup',
  'js': 'javascript',
  'kt': 'kotlin',
  'md': 'markdown',
  'pl': 'perl',
  'ps1': 'powershell',
  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'sh': 'bash',
  'shell': 'bash',
  'svg': 'markup',
  'ts': 'typescript',
  'xml': 'markup',
  'yml': 'yaml',
  'zsh': 'bash',
};

interface ComponentDef {
  load: () => Promise<unknown>;
  /** Prism components that must be registered first. Core languages
   *  (markup/css/clike/javascript) ship in the main entry and never
   *  need to be listed. */
  deps?: string[];
}

const COMPONENTS: Record<string, ComponentDef> = {
  'bash':       { load: () => import('prismjs/components/prism-bash') },
  'c':          { load: () => import('prismjs/components/prism-c') },
  'cpp':        { load: () => import('prismjs/components/prism-cpp'), deps: ['c'] },
  'csharp':     { load: () => import('prismjs/components/prism-csharp') },
  'dart':       { load: () => import('prismjs/components/prism-dart') },
  'diff':       { load: () => import('prismjs/components/prism-diff') },
  'docker':     { load: () => import('prismjs/components/prism-docker') },
  'elixir':     { load: () => import('prismjs/components/prism-elixir') },
  'go':         { load: () => import('prismjs/components/prism-go') },
  'graphql':    { load: () => import('prismjs/components/prism-graphql') },
  'haskell':    { load: () => import('prismjs/components/prism-haskell') },
  'http':       { load: () => import('prismjs/components/prism-http') },
  'ini':        { load: () => import('prismjs/components/prism-ini') },
  'java':       { load: () => import('prismjs/components/prism-java') },
  'json':       { load: () => import('prismjs/components/prism-json') },
  'jsx':        { load: () => import('prismjs/components/prism-jsx') },
  'kotlin':     { load: () => import('prismjs/components/prism-kotlin') },
  'lua':        { load: () => import('prismjs/components/prism-lua') },
  'makefile':   { load: () => import('prismjs/components/prism-makefile') },
  'markdown':   { load: () => import('prismjs/components/prism-markdown') },
  'markup-templating': { load: () => import('prismjs/components/prism-markup-templating') },
  'nginx':      { load: () => import('prismjs/components/prism-nginx') },
  'perl':       { load: () => import('prismjs/components/prism-perl') },
  'php':        { load: () => import('prismjs/components/prism-php'), deps: ['markup-templating'] },
  'powershell': { load: () => import('prismjs/components/prism-powershell') },
  'python':     { load: () => import('prismjs/components/prism-python') },
  'r':          { load: () => import('prismjs/components/prism-r') },
  'ruby':       { load: () => import('prismjs/components/prism-ruby') },
  'rust':       { load: () => import('prismjs/components/prism-rust') },
  'scss':       { load: () => import('prismjs/components/prism-scss') },
  'sql':        { load: () => import('prismjs/components/prism-sql') },
  'swift':      { load: () => import('prismjs/components/prism-swift') },
  'toml':       { load: () => import('prismjs/components/prism-toml') },
  'tsx':        { load: () => import('prismjs/components/prism-tsx'), deps: ['jsx', 'typescript'] },
  'typescript': { load: () => import('prismjs/components/prism-typescript') },
  'yaml':       { load: () => import('prismjs/components/prism-yaml') },
};

// One in-flight/settled promise per component so concurrent renders (or a
// document with many blocks of one language) never double-load a script.
const componentLoads = new Map<string, Promise<void>>();

async function ensureLanguage(mod: PrismInstance, rawLang: string): Promise<void> {
  const lang = LANGUAGE_ALIASES[rawLang] ?? rawLang;
  if (!mod.languages[lang]) {
    const def = COMPONENTS[lang];
    if (!def) return; // not a language we bundle — leave the block plain
    let load = componentLoads.get(lang);
    if (!load) {
      load = (async () => {
        try {
          for (const dep of def.deps ?? []) await ensureLanguage(mod, dep);
          await def.load();
        } catch (e) {
          console.warn('Failed to load Prism language component:', lang, e);
        }
      })();
      componentLoads.set(lang, load);
    }
    await load;
  }
  // Alias the raw fence name so highlightAllUnder resolves the block's own
  // class (`language-zsh`) even when the component didn't register it.
  if (rawLang !== lang && !mod.languages[rawLang] && mod.languages[lang]) {
    mod.languages[rawLang] = mod.languages[lang];
  }
}

function collectLanguages(container: HTMLElement): Set<string> {
  const langs = new Set<string>();
  for (const block of Array.from(container.querySelectorAll('pre code[class*="language-"]'))) {
    for (const cls of Array.from(block.classList)) {
      if (cls.startsWith('language-')) langs.add(cls.slice('language-'.length).toLowerCase());
    }
  }
  return langs;
}

/**
 * Loads the Prism core (plus theme CSS) and every language component needed
 * for the fenced blocks under `container`. Does not touch the DOM.
 */
export async function ensurePrismLanguages(container: HTMLElement): Promise<void> {
  const langs = collectLanguages(container);
  const mod = await loadPrismCore();
  await Promise.all([...langs].map((lang) => ensureLanguage(mod, lang)));
}

/** Highlights every fenced block under `container`. Synchronous; a no-op
 *  until the first `ensurePrismLanguages()` has loaded the core. */
export function highlightUnder(container: HTMLElement): void {
  prism?.highlightAllUnder(container);
}
