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
    'no-console': 'off'
  },
  overrides: [
    {
      // For test files - enable Jest environment
      files: ['tests/**/*.js'],
      env: {
        node: true,
        jest: true
      },
      parserOptions: {
        sourceType: 'script'
      }
    },
    {
      // For other files and CommonJS files
      files: ['scripts/**/*.js', 'src/**/*.js'],
      env: {
        node: true
      },
      parserOptions: {
        sourceType: 'script'
      }
    }
  ]
};
