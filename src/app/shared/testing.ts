/**
 * Helpers for component specs. Elements are found by their test hook
 * (`data-section-test="<section>-<action>"`), never by text or CSS class.
 */

/** The element with this test hook; fails the test if it is missing. */
export function hook<T extends HTMLElement = HTMLElement>(root: ParentNode, name: string): T {
  const element = findHook<T>(root, name);
  if (!element) throw new Error(`No element with data-section-test="${name}"`);
  return element;
}

export function findHook<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  name: string,
): T | null {
  return root.querySelector<T>(`[data-section-test="${name}"]`);
}

/** All elements whose test hook starts with `prefix`, in document order. */
export function hooks<T extends HTMLElement = HTMLElement>(root: ParentNode, prefix: string): T[] {
  return Array.from(root.querySelectorAll<T>(`[data-section-test^="${prefix}"]`));
}

/** Text of an element with whitespace collapsed. */
export function textOf(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}
