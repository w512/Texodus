import { describe, expect, it } from 'vitest';
import {
  promptUnsavedChanges,
  resolveUnsavedPrompt,
  useUnsavedPromptState,
  whenPromptsIdle,
} from './useUnsavedPrompt';

const { isOpen, options } = useUnsavedPromptState();

/** The prompt opens on a microtask (it waits its turn in the queue), so tests
 *  drain a few before asserting on what's on screen. */
async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Resolves to 'pending' unless `promise` settles first — used to assert that a
 *  prompt is still waiting for the user rather than silently resolved. */
function raceWithPending<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([promise, settle().then(() => 'pending' as const)]);
}

describe('promptUnsavedChanges', () => {
  it('resolves with the chosen answer', async () => {
    const choice = promptUnsavedChanges();
    await settle();
    expect(isOpen.value).toBe(true);
    resolveUnsavedPrompt('save');
    expect(await choice).toBe('save');
    expect(isOpen.value).toBe(false);
  });

  it('applies the passed labels, falling back to the defaults', async () => {
    const choice = promptUnsavedChanges({ title: 'File changed on disk', saveLabel: 'Overwrite' });
    await settle();
    expect(options.value.title).toBe('File changed on disk');
    expect(options.value.saveLabel).toBe('Overwrite');
    expect(options.value.cancelLabel).toBe('Cancel');
    resolveUnsavedPrompt('cancel');
    await choice;
  });

  // The regression this guards: a second caller used to resolve the open prompt
  // as 'cancel' and take over the modal, silently aborting the flow that was
  // waiting on it (the file watcher's poll cancelling the close-window walk).
  it('queues a concurrent prompt instead of cancelling the open one', async () => {
    const first = promptUnsavedChanges({ title: 'first' });
    const second = promptUnsavedChanges({ title: 'second' });
    await settle();

    // The first prompt is the one on screen, and it is still unanswered.
    expect(options.value.title).toBe('first');
    expect(await raceWithPending(first)).toBe('pending');

    resolveUnsavedPrompt('discard');
    expect(await first).toBe('discard');

    // Only now does the queued prompt take the modal.
    await settle();
    expect(isOpen.value).toBe(true);
    expect(options.value.title).toBe('second');
    expect(await raceWithPending(second)).toBe('pending');

    resolveUnsavedPrompt('save');
    expect(await second).toBe('save');
  });

  it('keeps three queued prompts in order', async () => {
    const answers: string[] = [];
    const prompts = ['a', 'b', 'c'].map((title) =>
      promptUnsavedChanges({ title }).then((choice) => answers.push(`${title}:${choice}`)),
    );

    for (const choice of ['save', 'discard', 'cancel'] as const) {
      await settle();
      resolveUnsavedPrompt(choice);
    }
    await Promise.all(prompts);

    expect(answers).toEqual(['a:save', 'b:discard', 'c:cancel']);
  });

  it('ignores a resolve when no prompt is open', async () => {
    expect(() => resolveUnsavedPrompt('save')).not.toThrow();
    expect(isOpen.value).toBe(false);
  });
});

describe('whenPromptsIdle', () => {
  it('resolves immediately when nothing is queued', async () => {
    await expect(whenPromptsIdle()).resolves.toBeUndefined();
  });

  it('waits for the open prompt to be answered', async () => {
    const choice = promptUnsavedChanges();
    await settle();

    let idle = false;
    const waiting = whenPromptsIdle().then(() => { idle = true; });
    await settle();
    expect(idle).toBe(false);

    resolveUnsavedPrompt('cancel');
    await choice;
    await waiting;
    expect(idle).toBe(true);
  });
});
