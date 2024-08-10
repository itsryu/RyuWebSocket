import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
    // [...]
    preset: 'ts-jest',
    extensionsToTreatAsEsm: ['.ts'],
    rootDir: './',
    testEnvironment: 'node',
    testMatch: [
        '<rootDir>/__tests__/*.test.ts'
    ]
};

export default jestConfig;