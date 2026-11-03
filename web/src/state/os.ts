/** Host OS name for user-facing copy. Static for the page's lifetime (Electron transport ⇒ Windows). */
export const OS: 'Windows' | 'macOS' =
  typeof window !== 'undefined' &&
  ((window as unknown as { ipshiftNative?: unknown }).ipshiftNative ||
    new URLSearchParams(window.location.search).get('platform') === 'windows')
    ? 'Windows'
    : 'macOS';
