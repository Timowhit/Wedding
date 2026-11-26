import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/', 'coverage/', '.superpowers/'] },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: globals.node
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-var': 'error',
            'prefer-const': 'error',
            eqeqeq: ['error', 'always'],
            'no-throw-literal': 'error',
            'no-implicit-coercion': 'error',
            'no-console': ['error', { allow: ['info', 'warn', 'error'] }]
        }
    },
    {
        // Browser scripts: progressive enhancement only, no modules shared with the server.
        files: ['public/js/**/*.js'],
        languageOptions: { sourceType: 'script', globals: globals.browser }
    }
];
