import type { ZovexBridge } from '../../electron/preload';

declare global {
  interface Window {
    zovex: ZovexBridge;
  }
}

export {};
