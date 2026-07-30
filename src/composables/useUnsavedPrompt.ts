import { ref, readonly } from 'vue';

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

export interface UnsavedPromptOptions {
  title?: string;
  body?: string;
  saveLabel?: string;
  discardLabel?: string;
  cancelLabel?: string;
}

const DEFAULT_OPTIONS: Required<UnsavedPromptOptions> = {
  title: 'Unsaved changes',
  body: 'You have unsaved changes. Save them before continuing?',
  saveLabel: 'Save',
  discardLabel: "Don't Save",
  cancelLabel: 'Cancel',
};

const isOpen = ref(false);
const options = ref<Required<UnsavedPromptOptions>>({ ...DEFAULT_OPTIONS });
let resolver: ((choice: UnsavedChoice) => void) | null = null;

// Tail of the prompt queue: the promise that settles when the last requested
// prompt has been answered. Only the most recent link is retained.
let queue: Promise<unknown> = Promise.resolve();

/** Opens the modal and resolves once the user picks. Never rejects. */
function showPrompt(promptOptions: UnsavedPromptOptions): Promise<UnsavedChoice> {
  options.value = { ...DEFAULT_OPTIONS, ...promptOptions };
  isOpen.value = true;
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

/**
 * Shows the unsaved-changes modal and resolves with the user's choice.
 * Implements the 3-button flow required by spec §4.4 (Save / Don't Save / Cancel),
 * which the binary native dialogs cannot express.
 *
 * Concurrent calls are **queued**, not merged: each waits for the open prompt to
 * be answered and then shows its own. The previous behaviour — resolving the
 * open prompt as `'cancel'` and taking over the modal — silently aborted
 * whichever flow was waiting on it. Real case: the file watcher polls every 2 s,
 * so its "changed on disk" prompt could land mid-way through the close-window
 * walk over dirty tabs (App.vue), cancel that walk, and leave the user with a
 * window that just refuses to close.
 */
export function promptUnsavedChanges(promptOptions: UnsavedPromptOptions = {}): Promise<UnsavedChoice> {
  const choice = queue.then(() => showPrompt(promptOptions));
  // Keep the chain alive even if a link somehow rejects, so one failure can't
  // wedge every later prompt.
  queue = choice.catch(() => undefined);
  return choice;
}

/**
 * Resolves once no prompt is open or queued. Callers whose prompt is optional
 * (the file watcher) use this to re-check their state before joining the queue:
 * a modal can sit on screen for minutes, and by the time it clears the flow
 * that owned it may have already saved or reloaded the file in question.
 */
export function whenPromptsIdle(): Promise<void> {
  return queue.then(() => undefined, () => undefined);
}

export function resolveUnsavedPrompt(choice: UnsavedChoice): void {
  if (!resolver) return;
  isOpen.value = false;
  const r = resolver;
  resolver = null;
  r(choice);
}

export function useUnsavedPromptState() {
  return { isOpen: readonly(isOpen), options: readonly(options) };
}
