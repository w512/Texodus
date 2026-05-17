<template>
  <textarea
    ref="editorRef"
    :value="editorStore.content"
    @input="handleInput"
    @keydown="handleKeydown"
    @scroll="handleScroll"
    class="editor-textarea"
    :style="{ fontFamily: settingsStore.editorFont, fontSize: settingsStore.fontSize + 'px' }"
    :spellcheck="false"
    placeholder="Start writing Markdown..."
  ></textarea>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { useMarkdownPreview } from '../composables/useMarkdownPreview';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const editorRef = ref(null);
const { setEditorElement, syncFromEditor } = useMarkdownPreview();

const handleInput = (e) => {
  editorStore.updateContent(e.target.value);
};

// Tab key → insert 2 spaces instead of losing focus (§3.1)
const handleKeydown = async (e) => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const el = e.target;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const value = el.value;
  editorStore.updateContent(value.substring(0, start) + '  ' + value.substring(end));
  await nextTick();
  el.setSelectionRange(start + 2, start + 2);
};

const handleScroll = () => syncFromEditor();

onMounted(() => setEditorElement(editorRef.value));
onUnmounted(() => setEditorElement(null));

// Expose ref for legacy callers (e.g. Toolbar via App.vue)
defineExpose({ editorRef });
</script>

<style scoped>
.editor-textarea {
  width: 100%;
  height: 100%;
  padding: 2rem 2.5rem;
  border: none;
  outline: none;
  resize: none;
  line-height: 1.75;
  background: transparent;
  color: var(--text-color);
  box-sizing: border-box;
  tab-size: 2;
  transition: color 0.2s;
}

.editor-textarea::placeholder {
  color: var(--text-muted);
  opacity: 0.5;
}
</style>
