// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import jestPlugin from 'eslint-plugin-jest';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    ...tseslint.configs.recommendedTypeChecked,
    {
        ignores: ['**/dist/**']
    },
    {
        plugins: {
            '@typescript-eslint': tseslint.plugin,
            jest: jestPlugin
        },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            '@typescript-eslint/no-unsafe-argument': 'error',
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/no-use-before-define': 'error',
            '@typescript-eslint/no-misused-promises': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            "@typescript-eslint/no-inferrable-types": "off",
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    'argsIgnorePattern': '^_'
                }
            ],
            'indent': [
                'error',
                4,
                {
                    'SwitchCase': 1
                }
            ],
            'quotes': [
                2,
                'single',
                {
                    'avoidEscape': true
                }
            ],
            'no-cond-assign': [
                'error',
                'always'
            ],
            'comma-dangle': [
                'error',
                'never'
            ],
            'semi': [
                2,
                'always'
            ]
        }
    },
    {
        // disable type-aware linting on JS files
        files: ['**/*.js'],
        ...tseslint.configs.disableTypeChecked
    },
    {
        // enable jest rules on test files
        files: ['__tests__/**/*', '__mocks__/**/*'],
        ...jestPlugin.configs['flat/recommended']
    }
);