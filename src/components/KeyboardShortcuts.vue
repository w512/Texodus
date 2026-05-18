<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useMarkdownPreview } from '../composables/useMarkdownPreview';
import { applyFormat } from '../composables/useFormatting';

const { getEditorElement } = useMarkdownPreview();

// File shortcuts (New / Open / Save / Save As) are owned by the native app
// menu's accelerators — see composables/useAppMenu.ts. This handler covers
// all 17 formatting shortcuts, and only fires while the editor textarea is focused.
const handleKeydown = (e) => {
  const ta = getEditorElement();
  if (!ta || document.activeElement !== ta) return;

  const isMac = navigator.userAgent.includes('Macintosh');
  
  // Modifiers
  const cmd = isMac ? e.metaKey : e.ctrlKey;
  const ctrl = e.ctrlKey;
  const shift = e.shiftKey;
  const alt = e.altKey;

  // 1. Underline: ⌘U (Cmd+U on Mac, Ctrl+U on Windows)
  if (cmd && !shift && !alt && e.code === 'KeyU') {
    e.preventDefault();
    applyFormat('underline', ta);
    return;
  }
  
  // 2. Strikethrough: ⇧⌘E (Cmd+Shift+E on Mac, Ctrl+Shift+E on Windows)
  if (cmd && shift && !alt && e.code === 'KeyE') {
    e.preventDefault();
    applyFormat('strikethrough', ta);
    return;
  }
  
  // 3. Link: ^⇧L (Ctrl+Shift+L on Mac, and Ctrl+Shift+L on Windows/Linux too since there's no conflict)
  if (ctrl && shift && !alt && e.code === 'KeyL') {
    e.preventDefault();
    applyFormat('link', ta);
    return;
  }
  
  // 4. Table: ⌘T (Cmd+T on Mac, Ctrl+T on Windows)
  if (cmd && !shift && !alt && e.code === 'KeyT') {
    e.preventDefault();
    applyFormat('table', ta);
    return;
  }
  
  // 5. Unordered List: ^U (Ctrl+U on Mac). On Windows/Linux, Ctrl+U is Underline, so we map ^U to Ctrl+Alt+U to avoid conflict!
  if ((isMac ? (ctrl && !cmd && !shift && !alt) : (ctrl && !shift && alt)) && e.code === 'KeyU') {
    e.preventDefault();
    applyFormat('list', ta);
    return;
  }
  
  // 6. Ordered List: ^⇧U (Ctrl+Shift+U on Mac). On Windows/Linux, we map to Ctrl+Alt+Shift+U to avoid conflict!
  if ((isMac ? (ctrl && !cmd && shift && !alt) : (ctrl && shift && alt)) && e.code === 'KeyU') {
    e.preventDefault();
    applyFormat('ordered_list', ta);
    return;
  }
  
  // 7. Task List: ⇧⌘T (Cmd+Shift+T on Mac, Ctrl+Shift+T on Windows)
  if (cmd && shift && !alt && e.code === 'KeyT') {
    e.preventDefault();
    applyFormat('task_list', ta);
    return;
  }
  
  // 8. Block Quote: ⇧⌘B (Cmd+Shift+B on Mac, Ctrl+Shift+B on Windows)
  if (cmd && shift && !alt && e.code === 'KeyB') {
    e.preventDefault();
    applyFormat('blockquote', ta);
    return;
  }
  
  // 9. Bold: ⌘B (Cmd+B on Mac, Ctrl+B on Windows)
  if (cmd && !shift && !alt && e.code === 'KeyB') {
    e.preventDefault();
    applyFormat('bold', ta);
    return;
  }
  
  // 10. Italic: ⌘I (Cmd+I on Mac, Ctrl+I on Windows)
  if (cmd && !shift && !alt && e.code === 'KeyI') {
    e.preventDefault();
    applyFormat('italic', ta);
    return;
  }
  
  // 11. Inline Code: ⌘K (Cmd+K on Mac, Ctrl+K on Windows)
  if (cmd && !shift && !alt && e.code === 'KeyK') {
    e.preventDefault();
    applyFormat('code', ta);
    return;
  }
  
  // 12. Block Code: ⇧⌘K (Cmd+Shift+K on Mac, Ctrl+Shift+K on Windows)
  if (cmd && shift && !alt && e.code === 'KeyK') {
    e.preventDefault();
    applyFormat('block_code', ta);
    return;
  }
  
  // 13. Inline Math: ^K (Ctrl+K on Mac). On Windows/Linux, we map to Ctrl+Alt+K to avoid conflict with Ctrl+K!
  if ((isMac ? (ctrl && !cmd && !shift && !alt) : (ctrl && !shift && alt)) && e.code === 'KeyK') {
    e.preventDefault();
    applyFormat('inline_math', ta);
    return;
  }
  
  // 14. Block Math: ^⇧K (Ctrl+Shift+K on Mac). On Windows/Linux, we map to Ctrl+Alt+Shift+K to avoid conflict with Ctrl+Shift+K!
  if ((isMac ? (ctrl && !cmd && shift && !alt) : (ctrl && shift && alt)) && e.code === 'KeyK') {
    e.preventDefault();
    applyFormat('block_math', ta);
    return;
  }
  
  // 15. Heading 1-6: ⌘1 to ⌘6 (Cmd+1..6 on Mac, Ctrl+1..6 on Windows)
  if (cmd && !shift && !alt && e.code.startsWith('Digit')) {
    const digit = parseInt(e.code.replace('Digit', ''), 10);
    if (digit >= 1 && digit <= 6) {
      e.preventDefault();
      applyFormat(`heading${digit}`, ta);
      return;
    }
  }
  
  // 16. Paragraph: ⇧⌘0 (Cmd+Shift+0 on Mac, Ctrl+Shift+0 on Windows)
  if (cmd && shift && !alt && e.code === 'Digit0') {
    e.preventDefault();
    applyFormat('paragraph', ta);
    return;
  }
  
  // 17. Horizontal Rule: ⌥⌘S (Cmd+Opt+S on Mac, Ctrl+Alt+S on Windows)
  if (cmd && !shift && alt && e.code === 'KeyS') {
    e.preventDefault();
    applyFormat('horizontal_rule', ta);
    return;
  }
};

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>
