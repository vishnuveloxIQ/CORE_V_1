import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/** Module boundaries (see docs/ARCHITECTURE.md). Modules talk to each other only through `@/modules/<name>` (its index.ts). */
const deepModuleImport = {
  group: ['@/modules/*/**'],
  message: 'Import another module only through its public API: @/modules/<name> (index.ts).',
}
const noAppImport = { group: ['@/app', '@/app/**'], message: 'Only main.tsx may import from app.' }

export default tseslint.config(
  { ignores: ['dist', 'scripts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/modules/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [deepModuleImport, noAppImport] }] },
  },
  {
    // app composes modules: barrels plus each module's routes.ts entry point.
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ ...deepModuleImport, group: ['@/modules/*/**', '!@/modules/*/routes'] }],
      }],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/modules', '@/modules/**', '**/modules/**'], message: 'shared must not depend on modules.' },
          { group: ['@/app', '@/app/**', '**/app/**'], message: 'shared must not depend on app.' },
        ],
      }],
    },
  },
)
