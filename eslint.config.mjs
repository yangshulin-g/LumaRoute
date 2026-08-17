import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/target/**',
      '**/coverage/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/one-component-per-file': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      globals: {
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Event: 'readonly',
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        ResizeObserver: 'readonly',
        clearTimeout: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        globalThis: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', 'tests/integration/support/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
  },
)
