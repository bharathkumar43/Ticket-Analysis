/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/src/tests/__mocks__/@prisma/client.ts',
  },
}
