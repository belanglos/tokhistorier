// Scene model: entities, anchors, positions, layering and hit testing.
// No DOM here, so it can be tested without a browser.

export type AnchorKind = "on" | "under" | "in" | "behind" | "beside";
export type AnchorRef = { entity: string; anchor: AnchorKind };
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type Entity = {
  id: string;
  kind: "figure" | "item" | "place";
  emoji: string;
  svg?: string; // replaces the emoji when set
  size: number; // height of the bounding box
  aspect?: number; // width / height, default 1
  seat?: number; // seat line as a fraction of the height from the top, default 0.5
  floor?: number; // where feet rest for "in", as a fraction of the height from the top, default 0.7
  x: number;
  y: number;
  // Listed anchors get the default geometry for their kind; fields given here override it.
  // Rects are relative to the entity's foot point (bottom center).
  anchors?: Partial<Record<AnchorKind, Partial<Rect>>>;
  hidden?: boolean;
};

export type Tap = { kind: "entity"; id: string } | { kind: "anchor"; ref: AnchorRef };

type Parent =
  | { type: "held"; by: string; worn: boolean }
  | { type: "anchor"; ref: AnchorRef; order: number };
type EntityState = { x: number; y: number; parent: Parent | null; visible: boolean };

export const ANCHOR_KINDS: readonly AnchorKind[] = ["on", "under", "in", "behind", "beside"];
const STACK = 55;

export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}`);
  return value;
}

export const sameRef = (a: AnchorRef, b: AnchorRef) =>
  a.entity === b.entity && a.anchor === b.anchor;

// --- Anchor geometry, derived from the host's bounding box ---

export const boxOf = (e: Entity) => ({ w: e.size * (e.aspect ?? 1), h: e.size });

// "behind" and "in" are drawn behind the host; every other anchor in front of it.
export const isBehind = (kind: AnchorKind) => kind === "behind" || kind === "in";

export function anchorRect(e: Entity, kind: AnchorKind): Rect {
  const { w, h } = boxOf(e);
  const seatY = -h + (e.seat ?? 0.5) * h;
  const defaults: Record<AnchorKind, Rect> = {
    on: { x: -0.4 * w, y: seatY - 0.3 * h, w: 0.8 * w, h: 0.3 * h },
    under: { x: -0.35 * w, y: 0, w: 0.7 * w, h: 0.25 * h },
    // Shifted up and right: only the top sticks out above the host.
    behind: { x: -0.15 * w, y: -1.35 * h, w: 0.6 * w, h: 0.75 * h },
    // Bottom on the floor line, so the host's front hides the occupant's lower part.
    in: { x: -0.3 * w, y: -1.3 * h, w: 0.6 * w, h: (e.floor ?? 0.7) * h + 0.3 * h },
    beside: { x: 0.6 * w, y: -0.6 * h, w: 0.6 * w, h: 0.6 * h },
  };
  return { ...defaults[kind], ...e.anchors?.[kind] };
}

// The part of a rect (relative to the host's foot point) above the host's top edge.
export const aboveHost = (e: Entity, r: Rect): Rect => ({
  ...r,
  h: Math.max(0, Math.min(r.y + r.h, -boxOf(e).h) - r.y),
});

const contains = (r: Rect, p: Point) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// Highest z first; at equal z the later one is drawn on top.
function topmostFirst<T>(items: T[], z: (item: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, z: z(item) }))
    .sort((a, b) => b.z - a.z || b.i - a.i)
    .map((x) => x.item);
}

export function createScene(entities: Entity[]) {
  const defs = new Map(entities.map((e) => [e.id, e]));
  const def = (id: string) => must(defs.get(id), `entity ${id}`);

  const anchorRefs: AnchorRef[] = [];
  const rects = new Map<string, Rect>();
  for (const e of entities) {
    for (const anchor of ANCHOR_KINDS) {
      if (!e.anchors?.[anchor]) continue;
      anchorRefs.push({ entity: e.id, anchor });
      rects.set(`${e.id}.${anchor}`, anchorRect(e, anchor));
    }
  }
  const rectOf = (ref: AnchorRef) =>
    must(rects.get(`${ref.entity}.${ref.anchor}`), `anchor ${ref.entity}.${ref.anchor}`);

  const state = new Map<string, EntityState>(
    entities.map((e) => [e.id, { x: e.x, y: e.y, parent: null, visible: !e.hidden }]),
  );
  const st = (id: string) => must(state.get(id), `state ${id}`);
  let order = 0;

  function free(id: string, x: number, y: number): void {
    const s = st(id);
    s.x = x;
    s.y = y;
    s.parent = null;
  }

  function hold(id: string, by: string, worn = false): void {
    st(id).parent = { type: "held", by, worn };
  }

  function attach(id: string, ref: AnchorRef): void {
    st(id).parent = { type: "anchor", ref, order: ++order };
  }

  function show(id: string): void {
    st(id).visible = true;
  }

  function holderOf(id: string): string | null {
    const p = st(id).parent;
    return p?.type === "held" ? p.by : null;
  }

  function parentEntity(id: string): string | null {
    const p = st(id).parent;
    if (!p) return null;
    return p.type === "held" ? p.by : p.ref.entity;
  }

  // The entity plus everything resting on or held by it, recursively.
  function group(id: string): string[] {
    const attachedTo = (other: string): boolean => {
      for (let p = parentEntity(other); p; p = parentEntity(p)) if (p === id) return true;
      return false;
    };
    return [id, ...entities.map((e) => e.id).filter((other) => other !== id && attachedTo(other))];
  }

  function occupants(ref: AnchorRef): string[] {
    const orderOf = (id: string) => {
      const p = st(id).parent;
      return p?.type === "anchor" ? p.order : 0;
    };
    return entities
      .map((e) => e.id)
      .filter((id) => {
        const p = st(id).parent;
        return p?.type === "anchor" && sameRef(p.ref, ref);
      })
      .sort((a, b) => orderOf(a) - orderOf(b));
  }

  function absPos(id: string): Point {
    const s = st(id);
    const p = s.parent;
    if (!p) return { x: s.x, y: s.y };
    if (p.type === "held") {
      const h = absPos(p.by);
      const size = def(p.by).size;
      return p.worn
        ? { x: h.x + size * 0.15, y: h.y }
        : { x: h.x + size * 0.35, y: h.y - size * 0.25 };
    }
    return slot(p.ref, occupants(p.ref).indexOf(id));
  }

  // Occupants stand on the bottom center of the anchor rect, side by side.
  function slot(ref: AnchorRef, index: number): Point {
    const o = absPos(ref.entity);
    const r = rectOf(ref);
    return { x: o.x + r.x + r.w / 2 + index * STACK, y: o.y + r.y + r.h };
  }

  // Where the next occupant of `ref` would end up.
  const dropPoint = (ref: AnchorRef) => slot(ref, occupants(ref).length);

  // Anchor rect in scene coordinates.
  function anchorBox(ref: AnchorRef): Rect {
    const o = absPos(ref.entity);
    const r = rectOf(ref);
    return { x: o.x + r.x, y: o.y + r.y, w: r.w, h: r.h };
  }

  function entityBox(id: string): Rect {
    const p = absPos(id);
    const { w, h } = boxOf(def(id));
    return { x: p.x - w / 2, y: p.y - h, w, h };
  }

  function zOf(id: string): number {
    if (def(id).kind === "place") return 10;
    const p = st(id).parent;
    if (!p) return 20;
    if (p.type === "held") return zOf(p.by) + 1;
    return zoneZ(p.ref) + 1;
  }

  // Anchor rects sit just behind or in front of their host; occupants right above the rect.
  function zoneZ(ref: AnchorRef): number {
    return zOf(ref.entity) + (isBehind(ref.anchor) ? -2 : 2);
  }

  // Places are never hit. Figures and items first, then anchor rects, topmost
  // first. For "behind" only the part sticking out above the host counts.
  function hit(p: Point): Tap | null {
    const things = entities.filter((e) => e.kind !== "place" && st(e.id).visible).map((e) => e.id);
    for (const id of topmostFirst(things, zOf)) {
      if (contains(entityBox(id), p)) return { kind: "entity", id };
    }
    for (const ref of topmostFirst(anchorRefs, zoneZ)) {
      if (!st(ref.entity).visible) continue;
      const o = absPos(ref.entity);
      const r = ref.anchor === "behind" ? aboveHost(def(ref.entity), rectOf(ref)) : rectOf(ref);
      if (contains({ x: o.x + r.x, y: o.y + r.y, w: r.w, h: r.h }, p)) return { kind: "anchor", ref };
    }
    return null;
  }

  return {
    def,
    anchorRefs,
    free,
    hold,
    attach,
    show,
    holderOf,
    group,
    absPos,
    dropPoint,
    anchorBox,
    zOf,
    zoneZ,
    hit,
  };
}
