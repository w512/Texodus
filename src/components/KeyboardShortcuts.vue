<!-- Renderless component: only installs global keydown shortcuts. -->
<template />

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useMarkdownPreview } from '../composables/useMarkdownPreview';
import { useDocumentSearch } from '../composables/useDocumentSearch';
import { applyFormat } from "../composables/useFormatting";
import { isMac } from '../utils/platform';

const { getEditorView } = useMarkdownPreview();
const { open: openSearch, isOpen: searchIsOpen, close: closeSearch } = useDocumentSearch();

interface ShortcutKey {
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  code: string;
}

interface ShortcutDef {
  format: string;
  mac: ShortcutKey;
  win: ShortcutKey;
}

// File shortcuts (New / Open / Save / Save As) are owned by the native app
// menu's accelerators — see composables/useAppMenu.ts. This handler covers
// the 17 formatting shortcuts and only fires while the editor textarea is focused.
//
// Each entry specifies the EXACT modifier set for both platforms; matching is
// strict equality, so combos like Cmd+Ctrl+K won't accidentally trip Cmd+K.
// `meta` = Cmd on macOS; `ctrl` is independent so Mac-only ^K (true ctrl, no
// cmd) can be expressed cleanly.
//
// Order matters when two entries share a code+key but differ in modifiers:
// keep the more-specific (more modifiers down) entry first so the loop hits
// it before the broader one. This isn't strictly needed today because every
// combination has unique modifier sets, but it's a safe convention going forward.

const SHORTCUTS: ShortcutDef[] = [
  // -- Inline wrap --
  { format: 'bold',         mac: { meta: true,                  code: 'KeyB' }, win: { ctrl: true,                    code: 'KeyB' } },
  { format: 'italic',       mac: { meta: true,                  code: 'KeyI' }, win: { ctrl: true,                    code: 'KeyI' } },
  { format: 'underline',    mac: { meta: true,                  code: 'KeyU' }, win: { ctrl: true,                    code: 'KeyU' } },
  { format: 'strikethrough',mac: { meta: true, shift: true,     code: 'KeyE' }, win: { ctrl: true, shift: true,       code: 'KeyE' } },
  { format: 'link',         mac: {             ctrl: true, shift: true, code: 'KeyL' }, win: { ctrl: true, shift: true, code: 'KeyL' } },

  // -- Code & math --
  { format: 'block_code',   mac: { meta: true, shift: true,     code: 'KeyK' }, win: { ctrl: true, shift: true,       code: 'KeyK' } },
  { format: 'code',         mac: { meta: true,                  code: 'KeyK' }, win: { ctrl: true,                    code: 'KeyK' } },
  // Mac ^K vs ^Shift+K (true ctrl, no cmd) → Win Ctrl+Alt+K to avoid Ctrl+K collision
  { format: 'block_math',   mac: { ctrl: true, shift: true,     code: 'KeyK' }, win: { ctrl: true, shift: true, alt: true, code: 'KeyK' } },
  { format: 'inline_math',  mac: { ctrl: true,                  code: 'KeyK' }, win: { ctrl: true, alt: true,         code: 'KeyK' } },

  // -- Blocks --
  { format: 'task_list',    mac: { meta: true, shift: true,     code: 'KeyT' }, win: { ctrl: true, shift: true,       code: 'KeyT' } },
  // Cmd/Ctrl+T is the native menu's New Tab accelerator (tabs mode) — the OS
  // consumes it before the webview sees the keydown, so table uses Alt.
  { format: 'table',        mac: { meta: true, alt: true,       code: 'KeyT' }, win: { ctrl: true, alt: true,         code: 'KeyT' } },
  { format: 'blockquote',   mac: { meta: true, shift: true,     code: 'KeyB' }, win: { ctrl: true, shift: true,       code: 'KeyB' } },
  // Mac ^Shift+U vs ^U → Win Ctrl+Alt+(Shift)+U to dodge Ctrl+U=Underline
  { format: 'ordered_list', mac: { ctrl: true, shift: true,     code: 'KeyU' }, win: { ctrl: true, alt: true, shift: true, code: 'KeyU' } },
  { format: 'list',         mac: { ctrl: true,                  code: 'KeyU' }, win: { ctrl: true, alt: true,         code: 'KeyU' } },
  // R for "rule": Cmd/Ctrl+Alt+S is the menu's Split View accelerator, and
  // Cmd+Alt+H is macOS "Hide Others" — both would swallow the keydown.
  { format: 'horizontal_rule', mac: { meta: true, alt: true,    code: 'KeyR' }, win: { ctrl: true, alt: true,         code: 'KeyR' } },

  // -- Headings & paragraph --
  { format: 'paragraph',    mac: { meta: true, shift: true,     code: 'Digit0' }, win: { ctrl: true, shift: true,     code: 'Digit0' } },
  { format: 'heading1',     mac: { meta: true,                  code: 'Digit1' }, win: { ctrl: true,                  code: 'Digit1' } },
  { format: 'heading2',     mac: { meta: true,                  code: 'Digit2' }, win: { ctrl: true,                  code: 'Digit2' } },
  { format: 'heading3',     mac: { meta: true,                  code: 'Digit3' }, win: { ctrl: true,                  code: 'Digit3' } },
  { format: 'heading4',     mac: { meta: true,                  code: 'Digit4' }, win: { ctrl: true,                  code: 'Digit4' } },
  { format: 'heading5',     mac: { meta: true,                  code: 'Digit5' }, win: { ctrl: true,                  code: 'Digit5' } },
  { format: 'heading6',     mac: { meta: true,                  code: 'Digit6' }, win: { ctrl: true,                  code: 'Digit6' } },
];

function modsMatch(e: KeyboardEvent, key: ShortcutKey): boolean {
  return e.code === key.code
    && !!e.metaKey  === !!key.meta
    && !!e.ctrlKey  === !!key.ctrl
    && !!e.shiftKey === !!key.shift
    && !!e.altKey   === !!key.alt;
}

// Find (Cmd/Ctrl+F) opens the app-level search bar (useDocumentSearch). Owned
// here — not via the editor's own Mod-f binding — so it works in every layout
// mode, including preview-only where the editor isn't mounted.
const FIND_KEY: { mac: ShortcutKey; win: ShortcutKey } = {
  mac: { meta: true, code: 'KeyF' },
  win: { ctrl: true, code: 'KeyF' },
};

const handleKeydown = (e: KeyboardEvent) => {
  // Close the search bar on Escape regardless of focus location.
  if (e.key === 'Escape' && searchIsOpen.value) {
    e.preventDefault();
    closeSearch();
    return;
  }

  if (modsMatch(e, isMac ? FIND_KEY.mac : FIND_KEY.win)) {
    e.preventDefault();
    openSearch();
    return;
  }

  const view = getEditorView();
  if (!view || !view.hasFocus) return;

  for (const sc of SHORTCUTS) {
    if (modsMatch(e, isMac ? sc.mac : sc.win)) {
      e.preventDefault();
      applyFormat(sc.format, view);
      return;
    }
  }
};

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>
