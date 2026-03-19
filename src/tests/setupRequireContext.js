// Polyfill webpack's require.context for Jest
const registerRequireContextHook = require('babel-plugin-require-context-hook/register');
registerRequireContextHook();
