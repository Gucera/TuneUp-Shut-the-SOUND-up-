const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
    expoConfig,
    {
        ignores: [
            'ios/**',
            'node_modules/**',
            '.expo/**',
            'coverage/**',
        ],
        rules: {
            'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
            '@typescript-eslint/array-type': 'off',
            'import/first': 'off',
            'react-hooks/exhaustive-deps': 'off',
            'react/display-name': 'off',
        },
    },
    {
        files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.ts'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
]);
