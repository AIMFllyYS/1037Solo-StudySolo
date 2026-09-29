import "@testing-library/jest-dom/vitest";
// JSDOM has no viewport scrolling; motion's measurement pass still calls this API.
import { vi } from 'vitest';
if (typeof window !== "undefined") window.scrollTo = vi.fn();

// JSDOM has no matchMedia; hooks like useIsMobile subscribe via it.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
