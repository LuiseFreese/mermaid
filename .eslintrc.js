module.exports = {
  env: {
    node: true,
    es2022: true,
    browser: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // Allow console.log in Node.js scripts
    'no-console': 'off',
    // Allow require() in CommonJS files
    '@typescript-eslint/no-var-requires': 'off'
  },
  overrides: [
    {
      // For test files and CommonJS files
      files: ['tests/**/*.js', 'scripts/**/*.js', 'src/**/*.js'],
      env: {
        node: true
      },
      parserOptions: {
        sourceType: 'script'
      }
    }
  ]
};
