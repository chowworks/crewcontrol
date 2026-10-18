import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  // plain Node scripts (the .ts ones get Node's types from tsconfig)
  files: ['scripts/**/*.mjs'],
  languageOptions: { globals: globals.node },
})
