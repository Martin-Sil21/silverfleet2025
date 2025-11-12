import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup después de cada test
afterEach(() => {
  cleanup();
  // Limpiar localStorage
  localStorage.clear();
  // Limpiar mocks
  vi.clearAllMocks();
});

// Mock de localStorage para tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock de process.env para tests
process.env.API_KEY = 'test-gemini-api-key';
process.env.GEMINI_API_KEY_FALLBACK = 'test-gemini-fallback-key';

// Mock global de fetch para tests de integración
global.fetch = vi.fn();

console.log('🧪 Test setup completo');
