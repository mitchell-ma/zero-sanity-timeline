declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

// Webpack require.context — works in both webpack and Jest (via babel-plugin-require-context-hook)
interface WebpackRequireContext {
  keys(): string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (key: string): any;
}

declare namespace NodeJS {
  interface Require {
    context(directory: string, useSubdirectories: boolean, regExp: RegExp): WebpackRequireContext;
  }
}
