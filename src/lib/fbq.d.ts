// The Meta Pixel snippet (see MetaPixel.tsx) defines window.fbq at runtime.
// Optional, because it only exists after the visitor accepted cookies and the
// vendor script finished loading — every call site goes through window.fbq?.().
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}
export {};
