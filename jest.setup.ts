import '@testing-library/jest-dom';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

// jsdom implements crypto.getRandomValues and randomUUID but not
// crypto.subtle, nor TextEncoder; the host secret is hashed with both
// (lib/host-secret.ts). Node's own implementations stand in.
if (!globalThis.crypto.subtle) {
  Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle, configurable: true });
}
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true, writable: true });
}

// Mock window.matchMedia for theme detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// localStorage and sessionStorage are left to jsdom, which implements both for
// real and — unlike the stubs that used to live here — keeps them separate.
// The stubs were a single shared object of jest.fn()s that stored nothing, so
// every suite touching storage had to replace them, and sessionStorage tests
// were silently asserting against the localStorage mock.
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
