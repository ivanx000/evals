import type { RunResult } from "../types.js";

// A ResultsStore persists and retrieves RunResult objects. `save` returns an
// id that is self-sufficient — passing it back into `load` (on any store,
// see makeResultsStore in index.ts) must resolve to the same result without
// extra context. `list` returns ids in that same form.
export interface ResultsStore {
  save(result: RunResult): Promise<string>;
  list(): Promise<string[]>;
  load(id: string): Promise<RunResult>;
}
