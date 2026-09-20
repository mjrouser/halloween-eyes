// A ~30-line stand-in for the bits of the DOM that render.js touches.
//
// render.js builds real SVG, so testing it normally means jsdom — and this
// project takes zero third-party dependencies deliberately. This is not a DOM
// implementation; it records element names, attributes and parentage, which is
// all the structural assertions in render.test.mjs need. Anything requiring
// real layout or painting stays a manual check on the Task 7 page.

class FakeNode {
  constructor(name) {
    this.nodeName = name;
    this.attrs = {};
    this.children = [];
    this.parent = null;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  get lastChild() { return this.children[this.children.length - 1] ?? null; }

  /** Every node beneath this one, depth-first. */
  descendants() {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
  /** Is `node` anywhere beneath this one? */
  contains(node) {
    for (let n = node?.parent; n; n = n.parent) if (n === this) return true;
    return false;
  }
}

/** Install the stub as the global `document`. Returns a restore function. */
export function installFakeDom() {
  const previous = globalThis.document;
  globalThis.document = { createElementNS: (_ns, name) => new FakeNode(name) };
  return () => { globalThis.document = previous; };
}
