import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
    // [...]
    preset: 'ts-jest',
    extensionsToTreatAsEsm: ['.ts'],
    rootDir: './',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^ws$': '<rootDir>/__mocks__/ws.ts'
    },
    testTimeout: 10000,
    testMatch: [
        '<rootDir>/__tests__/*.test.ts'
    ]
};

export default jestConfig;