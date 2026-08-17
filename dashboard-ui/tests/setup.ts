import "@testing-library/jest-dom/vitest";

// Recharts' ResponsiveContainer expects a ResizeObserver; jsdom doesn't ship one.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
