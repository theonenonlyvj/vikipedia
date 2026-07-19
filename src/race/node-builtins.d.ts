// This project's `src/` is Node-free by design (no `@types/node`
// dependency, tsconfig `lib` is browser/worker-only). raceHudScrollMargin
// test.ts is the one exception - it reads styles.css off disk (Vitest
// mocks `.css` imports, even with `?raw`, to an empty string, so
// `fs.readFileSync` is the only way to see the real file text). These
// ambient declarations cover just what that one test uses, rather than
// pulling in the full `@types/node` surface as a new dependency.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf-8"): string;
}

declare module "node:path" {
  export function join(...segments: string[]): string;
}

declare const __dirname: string;
