// sql.js ships no bundled types; we only use the WASM factory + a tiny DB surface
// (see the `DB` type in store.ts). Keep this loose on purpose.
declare module 'sql.js' {
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<any>;
  export default initSqlJs;
}
