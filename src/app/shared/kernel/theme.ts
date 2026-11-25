/** Whether the light theme applies; 'auto' follows the system. */
export function isLightTheme(theme: 'auto' | 'dark' | 'light'): boolean {
  if (theme !== 'auto') return theme === 'light';
  return !!globalThis.matchMedia?.('(prefers-color-scheme: light)')?.matches;
}
