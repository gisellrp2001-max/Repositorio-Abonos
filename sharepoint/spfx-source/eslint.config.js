const spfxProfile = require('@microsoft/eslint-config-spfx/lib/flat-profiles/react');

module.exports = [
  ...spfxProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig.json'
      }
    },
    rules: {
      '@rushstack/no-new-null': 'off',
      'no-void': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { caughtErrors: 'none' }]
    }
  }
];
