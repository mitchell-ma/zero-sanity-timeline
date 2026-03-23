module.exports = {
  testEnvironment: 'node',
  transform: {
    '\\.[jt]sx?$': ['babel-jest', {
      presets: ['react-app', '@babel/preset-typescript'],
      plugins: ['require-context-hook'],
    }],
  },
  setupFiles: ['<rootDir>/src/tests/setupRequireContext.js'],
  moduleNameMapper: {
    '\\.(webp|png|jpg|jpeg|gif|svg)$': '<rootDir>/src/tests/assetStub.js',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!uuid/)',
  ],
};
