<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useMarkdownPreview } from '../composables/useMarkdownPreview';
import { applyFormat } from '../composables/useFormatting';

const { getEditorElement } = useMarkdownPreview();

// File shortcuts (New / Open / Save / Save As) are owned by the native app
// menu's accelerators — see composables/useAppMenu.ts. This handler only covers
// formatting shortcuts, which have no menu equivalent, and only fires while the
// editor textarea is focused.
const handleKeydown = (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  const ta = getEditorElement();
  if (!ta || document.activeElement !== ta) return;

  if (e.code === 'KeyB') { e.preventDefault(); applyFormat('bold', ta); }
  if (e.code === 'KeyI') { e.preventDefault(); applyFormat('italic', ta); }
};

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>
