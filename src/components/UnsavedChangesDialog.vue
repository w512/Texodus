<template>
  <Transition name="modal">
    <div v-if="isOpen" class="modal-backdrop" @click.self="cancel">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-title">
        <h2 id="unsaved-title" class="modal-title">Unsaved changes</h2>
        <p class="modal-body">You have unsaved changes. Save them before continuing?</p>
        <div class="modal-actions">
          <button ref="cancelBtn" class="btn btn-ghost" @click="cancel">Cancel</button>
          <button class="btn btn-ghost" @click="discard">Don't Save</button>
          <button class="btn btn-primary" @click="save">Save</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useUnsavedPromptState, resolveUnsavedPrompt } from '../composables/useUnsavedPrompt';

const { isOpen } = useUnsavedPromptState();
const cancelBtn = ref<HTMLButtonElement | null>(null);

const save = () => resolveUnsavedPrompt('save');
const discard = () => resolveUnsavedPrompt('discard');
const cancel = () => resolveUnsavedPrompt('cancel');

watch(isOpen, async (open) => {
  if (!open) return;
  await nextTick();
  cancelBtn.value?.focus();
});

const onKey = (e: KeyboardEvent) => {
  if (!isOpen.value) return;
  if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  else if (e.key === 'Enter') { e.preventDefault(); save(); }
};

onMounted(() => window.addEventListener('keydown', onKey, true));
onUnmounted(() => window.removeEventListener('keydown', onKey, true));
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  min-width: 340px;
  max-width: 440px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.25rem 1.5rem 1.1rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  color: var(--text-color);
}

.modal-title {
  margin: 0 0 0.4rem;
  font-size: 1.05rem;
  font-weight: 600;
}

.modal-body {
  margin: 0 0 1.1rem;
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn {
  padding: 0.45rem 0.95rem;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}

.btn:active { transform: scale(0.97); }

.btn-ghost {
  background: transparent;
  color: var(--text-color);
  border-color: var(--border-color);
}
.btn-ghost:hover { background: var(--btn-hover); }

.btn-primary {
  background: var(--accent-color);
  color: white;
}
.btn-primary:hover { filter: brightness(1.08); }

.modal-enter-active,
.modal-leave-active { transition: opacity 0.18s ease; }
.modal-enter-active .modal,
.modal-leave-active .modal { transition: transform 0.18s ease, opacity 0.18s ease; }
.modal-enter-from,
.modal-leave-to { opacity: 0; }
.modal-enter-from .modal,
.modal-leave-to .modal { transform: translateY(8px) scale(0.97); opacity: 0; }
</style>
