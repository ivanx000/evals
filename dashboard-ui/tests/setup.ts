import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// `globals: false` (see vite.config.ts) means testing-library's automatic
// afterEach cleanup never gets registered — without this, each test's DOM
// stays mounted for the next one, producing "found multiple elements" errors.
afterEach(() => {
  cleanup();
});

// Recharts' ResponsiveContainer expects a ResizeObserver; jsdom doesn't ship one.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
