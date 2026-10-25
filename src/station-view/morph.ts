/**
 * Patches the children of `target` to match `html` instead of replacing them. Elements that stay keep their identity,
 * so focus, scroll, running CSS animations and transitions on changed classes or styles survive a repaint.
 *
 * Nodes match by type, tag and data-key: a changed data-key replaces the element, which runs its entry animation
 * again. Inputs take their checked state from the markup, and their value too unless they hold the focus (a seed
 * being typed is never overwritten). The diff walks siblings in order with one step of lookahead for a removed node;
 * any other reorder rebuilds the nodes after it, which is still correct, only without the kept identity.
 */
export function morph(target: Element, html: string) {
  const next = document.createElement('template');
  next.innerHTML = html;
  children(target, next.content);
}

const same = (a: Node, b: Node) => a.nodeType === b.nodeType && (a.nodeType !== Node.ELEMENT_NODE
  || ((a as Element).tagName === (b as Element).tagName && (a as Element).getAttribute('data-key') === (b as Element).getAttribute('data-key')));

function children(from: Node, to: Node) {
  let at = from.firstChild;
  for (let node = to.firstChild; node;) {
    const following: ChildNode | null = node.nextSibling;
    if (at && !same(at, node) && at.nextSibling && same(at.nextSibling, node)) { const gone = at; at = at.nextSibling; gone.remove(); }
    if (at && same(at, node)) { patch(at, node); at = at.nextSibling; } else from.insertBefore(node, at);
    node = following;
  }
  while (at) { const gone = at; at = at.nextSibling; gone.remove(); }
}

function patch(a: Node, b: Node) {
  if (a.nodeType !== Node.ELEMENT_NODE) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  const was = a as Element, now = b as Element;
  for (const { name } of Array.from(was.attributes)) if (!now.hasAttribute(name)) was.removeAttribute(name);
  for (const { name, value } of Array.from(now.attributes)) if (was.getAttribute(name) !== value) was.setAttribute(name, value);
  if (was instanceof HTMLInputElement) {
    if (was.type === 'radio' || was.type === 'checkbox') was.checked = now.hasAttribute('checked');
    else if ((was.getRootNode() as Document | ShadowRoot).activeElement !== was) was.value = now.getAttribute('value') ?? '';
  }
  children(was, now);
}
