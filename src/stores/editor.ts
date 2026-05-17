import { defineStore } from 'pinia';

interface EditorState {
  content: string;
  filePath: string | null;
  isDirty: boolean;
  aboutVisible: boolean;
}

export const useEditorStore = defineStore('editor', {
  state: (): EditorState => ({
    content: '',
    filePath: null,
    isDirty: false,
    aboutVisible: false,
  }),
  actions: {
    updateContent(newContent: string) {
      if (this.content === newContent) return;
      this.content = newContent;
      this.isDirty = true;
    },
    setFilePath(path: string | null) {
      this.filePath = path;
    },
    setDirty(dirty: boolean) {
      this.isDirty = dirty;
    },
    setAboutVisible(visible: boolean) {
      this.aboutVisible = visible;
    },
    loadFile(content: string, path: string | null) {
      this.content = content;
      this.filePath = path;
      this.isDirty = false;
    },
    reset() {
      this.content = '';
      this.filePath = null;
      this.isDirty = false;
    },
  },
});
