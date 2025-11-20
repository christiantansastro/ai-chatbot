// Temporary JSX shim to satisfy TypeScript while React types are unavailable.
// Remove this file once `react` and `@types/react` resolve properly.

import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any; // Broad allowance; narrow once environment fixed.
    }
  }
}

export {};