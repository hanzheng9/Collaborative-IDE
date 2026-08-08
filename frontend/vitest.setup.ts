import "@testing-library/jest-dom/vitest";

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

Object.assign(globalThis, {
  ResizeObserver: ResizeObserverMock
});

const localStorageData = new Map<string, string>();
const sessionStorageData = new Map<string, string>();

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    clear: () => localStorageData.clear(),
    getItem: (key: string) => localStorageData.get(key) ?? null,
    removeItem: (key: string) => localStorageData.delete(key),
    setItem: (key: string, value: string) => {
      localStorageData.set(key, value);
    }
  }
});

Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  value: {
    clear: () => sessionStorageData.clear(),
    getItem: (key: string) => sessionStorageData.get(key) ?? null,
    removeItem: (key: string) => sessionStorageData.delete(key),
    setItem: (key: string, value: string) => {
      sessionStorageData.set(key, value);
    }
  }
});

Object.assign(window, {
  matchMedia:
    window.matchMedia ??
    (() => ({
      addEventListener: () => {},
      dispatchEvent: () => false,
      matches: false,
      media: "",
      onchange: null,
      removeEventListener: () => {}
    }))
});
