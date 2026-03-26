/* eslint-env node */
/* global globalThis */
// Polyfill webpack's require.context for Jest
const registerRequireContextHook = require('babel-plugin-require-context-hook/register');
registerRequireContextHook();

// Polyfill crypto.getRandomValues for uuid v13+ in jsdom/node test environments
const { webcrypto } = require('crypto');
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
} else if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
}
