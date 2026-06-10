/**
 * Pointer-based drag & drop for the workspace sidebar tree.
 *
 * A drag starts only after the pointer moves >5px from the press point, so
 * plain clicks still open files / toggle folders. The click that ends a drag
 * is suppressed — callers must gate their click handlers through
 * `consumeSuppressedClick()`.
 */
import { onUnmounted, ref, type Ref } from 'vue';
import { type FileTreeNode } from '../stores/workspace';
import { isSameOrInside } from '../utils/path';

const DRAG_THRESHOLD_PX = 5;

interface SidebarDragDropOptions {
  /** Scroll container of the tree — pointer inside it (but outside any node) drops onto the root. */
  bodyRef: Ref<HTMLElement | null>;
  getRootPath: () => string | null;
  /** Called when a pointer press might become a drag (e.g. to close menus). */
  onDragStart?: () => void;
  onDrop: (source: FileTreeNode, targetDirectoryPath: string) => Promise<void> | void;
}

export function useSidebarDragDrop(options: SidebarDragDropOptions) {
  const draggingNode = ref<FileTreeNode | null>(null);
  const dropTargetPath = ref<string | null>(null);
  const dragCandidate = ref<{ node: FileTreeNode; startX: number; startY: number } | null>(null);
  let suppressNextClick = false;

  function prepareDrag(node: FileTreeNode, event: PointerEvent) {
    options.onDragStart?.();
    dragCandidate.value = { node, startX: event.clientX, startY: event.clientY };
    window.addEventListener('pointermove', handlePointerDragMove);
    window.addEventListener('pointerup', handlePointerDragEnd, { once: true });
    window.addEventListener('pointercancel', cancelPointerDrag, { once: true });
  }

  function handlePointerDragMove(event: PointerEvent) {
    const candidate = dragCandidate.value;
    if (!candidate) return;

    const moved = Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY);
    if (!draggingNode.value && moved < DRAG_THRESHOLD_PX) return;
    if (!draggingNode.value) {
      draggingNode.value = candidate.node;
      suppressNextClick = true;
      document.body.classList.add('is-dragging-sidebar-node');
    }

    dropTargetPath.value = getDropTargetPathAt(event.clientX, event.clientY);
  }

  async function handlePointerDragEnd(event: PointerEvent) {
    window.removeEventListener('pointermove', handlePointerDragMove);
    window.removeEventListener('pointercancel', cancelPointerDrag);

    const source = draggingNode.value;
    const targetPath = getDropTargetPathAt(event.clientX, event.clientY);
    endDrag();
    if (!source || !targetPath) return;
    await options.onDrop(source, targetPath);
  }

  function cancelPointerDrag() {
    window.removeEventListener('pointermove', handlePointerDragMove);
    endDrag();
  }

  function getDropTargetPathAt(x: number, y: number): string | null {
    const source = draggingNode.value;
    const rootPath = options.getRootPath();
    if (!source || !rootPath) return null;

    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!element) return null;

    const button = element.closest<HTMLElement>('[data-sidebar-path]');
    if (button) {
      const path = button.dataset.sidebarPath;
      const kind = button.dataset.sidebarKind;
      if (path && kind === 'directory' && canDrop(source.path, path)) return path;
      return null;
    }

    if (options.bodyRef.value?.contains(element) && canDrop(source.path, rootPath)) return rootPath;
    return null;
  }

  function canDrop(sourcePath: string, targetDirectoryPath: string): boolean {
    return sourcePath !== targetDirectoryPath && !isSameOrInside(targetDirectoryPath, sourcePath);
  }

  function endDrag() {
    dragCandidate.value = null;
    draggingNode.value = null;
    dropTargetPath.value = null;
    document.body.classList.remove('is-dragging-sidebar-node');
  }

  /** True (and resets) when the click ending a drag should be ignored. */
  function consumeSuppressedClick(): boolean {
    if (!suppressNextClick) return false;
    suppressNextClick = false;
    return true;
  }

  onUnmounted(() => {
    window.removeEventListener('pointermove', handlePointerDragMove);
    window.removeEventListener('pointercancel', cancelPointerDrag);
  });

  return { draggingNode, dropTargetPath, prepareDrag, consumeSuppressedClick };
}
