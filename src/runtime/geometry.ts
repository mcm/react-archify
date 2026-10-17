// The viewer measures everything against the browser window. Inside the
// component, its "window" is the viewport box, so element rects, screen
// matrices and pointer coordinates are re-based on that box's origin. The
// vendored runtime calls these through symbols (see sync-archify.mjs).

export const RECT = Symbol.for('react-archify.rect');
export const SCREEN_CTM = Symbol.for('react-archify.screenCTM');

type OriginSource = () => { x: number; y: number };

const origins = new WeakMap<Node, OriginSource>();

export function registerOrigin(root: Node, origin: OriginSource): void {
  origins.set(root, origin);
}

export function unregisterOrigin(root: Node): void {
  origins.delete(root);
}

function originOf(element: Element): { x: number; y: number } | null {
  const source = origins.get(element.getRootNode());
  return source ? source() : null;
}

interface GeometryElement extends Element {
  [RECT]?: () => DOMRect;
  [SCREEN_CTM]?: () => DOMMatrix | null;
}

let installed = false;

export function installGeometry(): void {
  if (installed || typeof Element === 'undefined') return;
  installed = true;
  const proto = Element.prototype as GeometryElement;
  Object.defineProperty(proto, RECT, {
    configurable: true,
    value(this: Element) {
      const rect = this.getBoundingClientRect();
      const origin = originOf(this);
      if (!origin || (origin.x === 0 && origin.y === 0)) return rect;
      return new DOMRect(rect.x - origin.x, rect.y - origin.y, rect.width, rect.height);
    },
  });
  Object.defineProperty(proto, SCREEN_CTM, {
    configurable: true,
    value(this: SVGGraphicsElement) {
      const matrix = typeof this.getScreenCTM === 'function' ? this.getScreenCTM() : null;
      if (!matrix) return matrix;
      const origin = originOf(this);
      if (!origin || (origin.x === 0 && origin.y === 0)) return matrix;
      return new DOMMatrix([1, 0, 0, 1, -origin.x, -origin.y]).multiply(matrix);
    },
  });
}
