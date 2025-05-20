const typescriptParser = require('@typescript-eslint/parser');
const typescriptPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [{
  name: 'global',
  ignores: [
    'lib/',
    'node_modules/',
    'jest.config.js',
    'tsconfig.json',
    'tsup.config.ts',
    'package.json'
  ]
}, {
  name: 'ts',
  files: ["*.ts", "**/*.ts"],
  plugins: {
    "@typescript-eslint": typescriptPlugin
  },
  languageOptions: {
    parser: typescriptParser,
    parserOptions: {
      project: "./tsconfig.json",
      sourceType: "module",
      ecmaVersion: 2020
    }
  },
  rules: {
    'semi': ['error', 'always'],
    'quotes': ['error', 'single'],
    'indent': ['error', 2],
    '@typescript-eslint/no-explicit-any': 0
  }
}];