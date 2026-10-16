/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  root: true,
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    '@vue/eslint-config-typescript',
    '@vue/eslint-config-prettier/skip-formatting'
  ],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  overrides: [
    {
      // TS 规则只对 TS/Vue 文件有意义；JS/CJS 文件（如本配置文件）没有
      // TS parser services，consistent-type-imports 会直接报错
      files: ['**/*.js', '**/*.cjs'],
      rules: {
        '@typescript-eslint/consistent-type-imports': 'off'
      }
    }
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }
    ],

    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-duplicate-imports': 'error',
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],

    'vue/multi-word-component-names': 'off',
    'vue/no-mutating-props': 'error',
    'vue/no-unused-components': 'error',
    'vue/no-unused-vars': 'error',
    'vue/require-default-prop': 'off',
    'vue/require-explicit-emits': 'error',
    'vue/require-prop-types': 'error',

    // 函数之间空行
    'padding-line-between-statements': [
      'error',
      { blankLine: 'always', prev: 'function', next: '*' },
      { blankLine: 'always', prev: '*', next: 'function' },
      { blankLine: 'always', prev: 'block', next: '*' },
      { blankLine: 'always', prev: '*', next: 'block' },
      { blankLine: 'always', prev: 'var', next: 'return' }
    ],
    'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
    'vue/padding-line-between-blocks': ['error', 'always']
  }
};
