import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default defineConfig(
  {
    // `tolaria/` is an unrelated local-only project with its own (broken here)
    // eslint config — without the ignore, `eslint .` walks into it and dies.
    ignores: ['dist/**', 'src-tauri/**', 'node_modules/**', 'tolaria/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // 'essential' = correctness rules only; the codebase predates the linter,
  // so the stylistic tiers would demand a mass reformat for no safety gain.
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    rules: {
      // Enforces the project convention: <template> → <script> → <style>.
      'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
      // Single-word component names (Sidebar, Toolbar, …) are established here.
      'vue/multi-word-component-names': 'off',
      // `_`-prefixed = intentionally unused; rest-sibling destructuring is the
      // settings store's way of excluding transient fields from persistence.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
    },
  },
  {
    // Renderless component — exists only to install global shortcuts.
    files: ['src/components/KeyboardShortcuts.vue'],
    rules: { 'vue/valid-template-root': 'off' },
  },
  {
    // The *.vue module shim follows Vue's canonical form, `{}` included.
    files: ['**/*.d.ts'],
    rules: { '@typescript-eslint/no-empty-object-type': 'off' },
  },
);
