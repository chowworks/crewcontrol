import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['src/**/*.{ts,tsx}'],
  plugins: {
    'react-hooks': reactHooks,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    // `_name` marks a value left out on purpose, as when a rest pattern drops fields.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
  },
})
