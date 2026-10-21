// Story 1 ("Katten och tofflan"), hardcoded. The scene is a list of entities
// with positions and anchors so it can be turned into data later.
import "./styles/scene.css";

type AnchorKind = "on" | "under" | "in" | "behind" | "beside";
type AnchorRef = { entity: string; anchor: AnchorKind };

type Effect =
  | { type: "bubble"; entity: string; emoji: string }
  | { type: "spawn"; entity: string; emoji: string; at: AnchorRef };

type ActionStep = {
  kind: "action";
  text: string;
  verb: "take" | "put" | "move";
  anim?: "walk" | "jump";
  actor?: string;
  object?: string;
  target?: AnchorRef;
  effects?: Effect[];
};

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

type Entity = {
  id: string;
  kind: "place" | "figure" | "object";
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

const W = 1000;
const H = 600;
const FLOOR = 590;
const STACK = 55;
const ANCHOR_KINDS: readonly AnchorKind[] = ["on", "under", "in", "behind", "beside"];

// Simple one-colour sofa: the 🛋️ emoji has a lamp and no clear seat on some platforms.
const SOFA_SVG = `<svg viewBox="0 0 150 100" width="100%" height="100%" fill="#d9634c" stroke="#fdf6e3" stroke-width="3">
  <rect x="15" y="5" width="120" height="45" rx="8"/>
  <rect x="12" y="55" width="126" height="28" rx="5"/>
  <rect x="22" y="44" width="53" height="18" rx="6"/>
  <rect x="75" y="44" width="53" height="18" rx="6"/>
  <rect x="0" y="30" width="24" height="53" rx="8"/>
  <rect x="126" y="30" width="24" height="53" rx="8"/>
  <rect x="22" y="83" width="9" height="17"/>
  <rect x="119" y="83" width="9" height="17"/>
</svg>`;

const ENTITIES: Entity[] = [
  {
    id: "sang",
    kind: "place",
    emoji: "🛏️",
    size: 190,
    x: 130,
    y: 420,
    anchors: { on: {}, under: {} },
  },
  {
    id: "soffa",
    kind: "place",
    emoji: "",
    svg: SOFA_SVG,
    size: 140,
    aspect: 1.5,
    seat: 0.44, // top of the cushions
    x: 400,
    y: 420,
    anchors: { on: {}, under: {}, behind: {} },
  },
  {
    id: "badkar",
    kind: "place",
    emoji: "🛁",
    size: 180,
    x: 680,
    y: 420,
    anchors: { in: {} },
  },
  {
    id: "toalett",
    kind: "place",
    emoji: "🚽",
    size: 150,
    x: 905,
    y: 420,
    anchors: { on: {}, in: {} },
  },
  { id: "katt", kind: "figure", emoji: "🐈", size: 95, x: 280, y: 570 },
  {
    id: "pappa",
    kind: "figure",
    emoji: "👨",
    size: 130,
    seat: 0, // "on" is the head
    x: 540,
    y: 570,
    anchors: { on: {} },
  },
  // Only there as a third actor candidate.
  { id: "hund", kind: "figure", emoji: "🐶", size: 90, x: 945, y: 570 },
  { id: "toffla", kind: "object", emoji: "🩴", size: 70, x: 120, y: 585 },
  { id: "strumpa", kind: "object", emoji: "🧦", size: 70, x: 400, y: 585 },
  { id: "boll", kind: "object", emoji: "⚽", size: 70, x: 700, y: 585 },
  { id: "hatt", kind: "object", emoji: "🎩", size: 70, x: 850, y: 585 },
  { id: "anka", kind: "object", emoji: "🦆", size: 80, x: 0, y: 0, hidden: true },
  { id: "mus", kind: "figure", emoji: "🐭", size: 60, x: 0, y: 0, hidden: true },
];

const STEPS: ActionStep[] = [
  { kind: "action", text: "Katten tar tofflan.", verb: "take", actor: "katt", object: "toffla" },
  {
    kind: "action",
    text: "Katten gömmer den under sängen.",
    verb: "put",
    object: "toffla",
    target: { entity: "sang", anchor: "under" },
  },
  {
    kind: "action",
    text: "Pappa letar bakom soffan.",
    verb: "move",
    anim: "walk",
    actor: "pappa",
    target: { entity: "soffa", anchor: "behind" },
    effects: [{ type: "bubble", entity: "pappa", emoji: "❓" }],
  },
  {
    kind: "action",
    text: "Pappa letar i badkaret.",
    verb: "move",
    anim: "walk",
    actor: "pappa",
    target: { entity: "badkar", anchor: "in" },
    effects: [
      { type: "spawn", entity: "anka", emoji: "🦆", at: { entity: "badkar", anchor: "in" } },
      { type: "bubble", entity: "anka", emoji: "KVACK" },
    ],
  },
  {
    kind: "action",
    text: "Katten hoppar upp på pappas huvud.",
    verb: "move",
    anim: "jump",
    actor: "katt",
    target: { entity: "pappa", anchor: "on" },
  },
  { kind: "action", text: "Pappa tar tofflan.", verb: "take", actor: "pappa", object: "toffla" },
];

type Tap = { kind: "entity"; id: string } | { kind: "anchor"; ref: AnchorRef };
type Parent =
  | { type: "held"; by: string; worn: boolean }
  | { type: "anchor"; ref: AnchorRef; order: number };
type EntityState = { x: number; y: number; parent: Parent | null };

const MISTAKES = ["spin", "topple", "shake", "recoil"] as const;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}`);
  return value;
}

const sameRef = (a: AnchorRef, b: AnchorRef) => a.entity === b.entity && a.anchor === b.anchor;

// --- Anchor geometry, derived from the host's bounding box ---

const boxOf = (e: Entity) => ({ w: e.size * (e.aspect ?? 1), h: e.size });

// "behind" and "in" are drawn behind the host; every other anchor in front of it.
const isBehind = (kind: AnchorKind) => kind === "behind" || kind === "in";

function anchorRect(e: Entity, kind: AnchorKind): Rect {
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

// Dev check: anchor rects of one host must not overlap. For "behind" and "in"
// only the part that sticks out above the host counts, the rest is hidden by it.
function warnOverlappingAnchors(): void {
  const TOLERANCE = 4;
  for (const e of ENTITIES) {
    const top = -boxOf(e).h;
    const kinds = ANCHOR_KINDS.filter((k) => e.anchors?.[k]);
    if (kinds.includes("in") && kinds.includes("behind")) {
      console.warn(`${e.id} has both "in" and "behind"; a host may only have one of them`);
    }
    const visible = (k: AnchorKind): Rect => {
      const r = anchorRect(e, k);
      return isBehind(k) ? { ...r, h: Math.max(0, Math.min(r.y + r.h, top) - r.y) } : r;
    };
    kinds.forEach((a, i) => {
      for (const b of kinds.slice(i + 1)) {
        const ra = visible(a);
        const rb = visible(b);
        const ox = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
        const oy = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
        if (ox > TOLERANCE && oy > TOLERANCE) {
          console.warn(`Anchors ${e.id}.${a} and ${e.id}.${b} overlap by ${Math.round(ox)}x${Math.round(oy)} px`);
        }
      }
    });
  }
}

function isCorrect(step: ActionStep, a: Tap, b: Tap): boolean {
  const first = step.verb === "put" ? step.object : step.actor;
  if (a.kind !== "entity" || a.id !== first) return false;
  if (step.verb === "take") return b.kind === "entity" && b.id === step.object;
  return b.kind === "anchor" && step.target !== undefined && sameRef(b.ref, step.target);
}

// Plays the story in `scene`. Resolves when the finale is done.
function runStory(scene: HTMLElement, sentence: HTMLElement): Promise<void> {
  const defs = new Map(ENTITIES.map((e) => [e.id, e]));
  const def = (id: string) => must(defs.get(id), `entity ${id}`);
  const rects = new Map<string, Rect>();
  for (const e of ENTITIES) {
    for (const k of ANCHOR_KINDS) if (e.anchors?.[k]) rects.set(`${e.id}.${k}`, anchorRect(e, k));
  }
  const rectOf = (ref: AnchorRef) =>
    must(rects.get(`${ref.entity}.${ref.anchor}`), `anchor ${ref.entity}.${ref.anchor}`);

  const state = new Map<string, EntityState>(
    ENTITIES.map((e) => [e.id, { x: e.x, y: e.y, parent: null }]),
  );
  const st = (id: string) => must(state.get(id), `state ${id}`);
  let order = 0;

  const nodes = new Map<string, { el: HTMLElement; glyph: HTMLElement }>();
  const node = (id: string) => must(nodes.get(id), `node ${id}`);
  const zones: { el: HTMLElement; ref: AnchorRef }[] = [];
  const tapByEl = new Map<Element, Tap>();

  for (const e of ENTITIES) {
    const el = document.createElement("div");
    el.className = "ent";
    el.dataset.entity = e.id;
    el.style.fontSize = `${e.size}px`;
    el.hidden = e.hidden ?? false;
    const glyph = document.createElement("span");
    glyph.className = "glyph";
    if (e.svg) {
      const { w, h } = boxOf(e);
      glyph.style.width = `${w}px`;
      glyph.style.height = `${h}px`;
      glyph.innerHTML = e.svg;
    } else {
      glyph.textContent = e.emoji;
    }
    el.append(glyph);
    scene.append(el);
    nodes.set(e.id, { el, glyph });
    tapByEl.set(el, { kind: "entity", id: e.id });

    for (const anchor of ANCHOR_KINDS) {
      if (!e.anchors?.[anchor]) continue;
      const ref = { entity: e.id, anchor };
      const r = rectOf(ref);
      const zone = document.createElement("div");
      zone.className = "anchor";
      zone.dataset.anchor = `${e.id}.${anchor}`;
      zone.style.width = `${r.w}px`;
      zone.style.height = `${r.h}px`;
      scene.append(zone);
      zones.push({ el: zone, ref });
      tapByEl.set(zone, { kind: "anchor", ref });
    }
  }

  // --- Scene state ---

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
    return [id, ...ENTITIES.map((e) => e.id).filter((other) => other !== id && attachedTo(other))];
  }

  function occupants(ref: AnchorRef): string[] {
    const orderOf = (id: string) => {
      const p = st(id).parent;
      return p?.type === "anchor" ? p.order : 0;
    };
    return ENTITIES.map((e) => e.id)
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

  // --- Rendering ---

  function render(): void {
    for (const e of ENTITIES) {
      const { el } = node(e.id);
      const p = absPos(e.id);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.zIndex = String(zOf(e.id));
    }
    for (const { el, ref } of zones) {
      const o = absPos(ref.entity);
      const r = rectOf(ref);
      el.style.left = `${o.x + r.x}px`;
      el.style.top = `${o.y + r.y}px`;
      el.style.zIndex = String(zoneZ(ref));
    }
  }

  function setDuration(ids: string[], ms: number): void {
    for (const id of ids) node(id).el.style.transitionDuration = `${ms}ms`;
    for (const z of zones) if (ids.includes(z.ref.entity)) z.el.style.transitionDuration = `${ms}ms`;
  }

  async function slide(id: string, mutate: () => void, ms: number): Promise<void> {
    mutate();
    const ids = group(id);
    setDuration(ids, ms);
    render();
    await wait(ms);
    setDuration(ids, 0);
  }

  async function travel(id: string, mutate: () => void, anim: "walk" | "jump" | "run"): Promise<void> {
    const from = absPos(id);
    mutate();
    const to = absPos(id);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const ms = anim === "jump" ? 700 : Math.max(400, dist * (anim === "run" ? 1.2 : 2.5));
    const { glyph } = node(id);
    const cls = anim === "jump" ? "hopping" : "walking";
    if (anim === "jump") glyph.style.animationDuration = `${ms}ms`;
    glyph.classList.add(cls);
    await slide(id, () => {}, ms);
    glyph.classList.remove(cls);
    glyph.style.animationDuration = "";
  }

  async function say(id: string, content: string, ms: number): Promise<void> {
    const p = absPos(id);
    const el = document.createElement("div");
    el.className = "bubble";
    el.textContent = content;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y - def(id).size}px`;
    scene.append(el);
    await wait(ms);
    el.remove();
  }

  async function appear(id: string): Promise<void> {
    const { el, glyph } = node(id);
    render();
    el.hidden = false;
    glyph.classList.add("pop");
    await wait(350);
    glyph.classList.remove("pop");
  }

  async function fall(id: string): Promise<void> {
    node(id).glyph.classList.add("fallen");
    await wait(500);
  }

  async function mistake(id: string): Promise<void> {
    const kind = must(MISTAKES[Math.floor(Math.random() * MISTAKES.length)], "mistake");
    const { glyph } = node(id);
    glyph.classList.add(kind);
    await wait(600);
    glyph.classList.remove(kind);
  }

  // --- Steps ---

  async function perform(step: ActionStep): Promise<void> {
    switch (step.verb) {
      case "take": {
        const actor = must(step.actor, "actor");
        const object = must(step.object, "object");
        const o = absPos(object);
        const side = absPos(actor).x < o.x ? -1 : 1;
        const x = o.x + side * (def(actor).size * 0.5 + def(object).size * 0.3);
        await travel(actor, () => free(actor, x, o.y), "walk");
        await slide(object, () => hold(object, actor), 250);
        return;
      }
      case "put": {
        const object = must(step.object, "object");
        const target = must(step.target, "target");
        const holder = holderOf(object);
        if (holder) {
          const d = dropPoint(target);
          const side = absPos(holder).x < d.x ? -1 : 1;
          const x = d.x + side * (def(holder).size * 0.5 + def(object).size * 0.3);
          await travel(holder, () => free(holder, x, d.y), "walk");
        }
        await slide(object, () => attach(object, target), 300);
        return;
      }
      case "move": {
        const actor = must(step.actor, "actor");
        const target = must(step.target, "target");
        await travel(actor, () => attach(actor, target), step.anim ?? "walk");
        return;
      }
    }
  }

  async function runEffect(effect: Effect): Promise<void> {
    switch (effect.type) {
      case "bubble":
        return say(effect.entity, effect.emoji, 1200);
      case "spawn":
        attach(effect.entity, effect.at);
        node(effect.entity).glyph.textContent = effect.emoji;
        return appear(effect.entity);
    }
  }

  // Pappa puts on the slipper, a mouse jumps out, the cat chases it, pappa falls over.
  async function finale(): Promise<void> {
    await slide("toffla", () => hold("toffla", "pappa", true), 400);
    const t = absPos("toffla");
    free("mus", t.x, t.y);
    await appear("mus");
    await travel("mus", () => free("mus", t.x + 160, FLOOR), "jump");
    const p = absPos("pappa");
    await Promise.all([
      travel("mus", () => free("mus", W + 150, FLOOR), "run"),
      (async () => {
        await travel("katt", () => free("katt", p.x + 110, FLOOR), "jump");
        await Promise.all([travel("katt", () => free("katt", W + 150, FLOOR), "run"), fall("pappa")]);
      })(),
    ]);
    await wait(400);
  }

  // --- Input ---

  // Topmost hit wins, so a "behind" rect is only tappable where it shows.
  function hit(x: number, y: number): Tap | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const owner = el.closest("[data-entity], [data-anchor]");
      const tap = owner ? tapByEl.get(owner) : undefined;
      if (tap) return tap;
    }
    return null;
  }

  function elOf(tap: Tap): HTMLElement {
    if (tap.kind === "entity") return node(tap.id).el;
    return must(zones.find((z) => sameRef(z.ref, tap.ref)), "zone").el;
  }

  render();

  return new Promise((resolve) => {
    let index = 0;
    let taps: Tap[] = [];
    let busy = false;

    const show = () => {
      sentence.textContent = must(STEPS[index], "step").text;
    };

    scene.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || busy) return;
      const tap = hit(event.clientX, event.clientY);
      if (tap) void onTap(tap);
    });

    async function onTap(tap: Tap): Promise<void> {
      taps.push(tap);
      elOf(tap).classList.add("selected");
      const [a, b] = taps;
      if (!a || !b) return;
      busy = true;
      for (const t of taps) elOf(t).classList.remove("selected");
      taps = [];
      const step = must(STEPS[index], "step");
      if (!isCorrect(step, a, b)) {
        await mistake(a.kind === "entity" ? a.id : a.ref.entity);
        busy = false;
        return;
      }
      await perform(step);
      for (const effect of step.effects ?? []) await runEffect(effect);
      index++;
      if (index < STEPS.length) {
        show();
        busy = false;
      } else {
        await finale();
        resolve();
      }
    }

    show();
  });
}

export function mountStory(root: HTMLElement): void {
  if (import.meta.env.DEV) warnOverlappingAnchors();
  const sentence = document.createElement("div");
  sentence.className = "sentence";
  const stage = document.createElement("div");
  stage.className = "stage";
  root.replaceChildren(sentence, stage);

  let scene = document.createElement("div");
  const fit = () => {
    const s = Math.min(stage.clientWidth / W, stage.clientHeight / H);
    scene.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  new ResizeObserver(fit).observe(stage);

  const play = async () => {
    scene = document.createElement("div");
    scene.className = "scene";
    stage.replaceChildren(scene);
    fit();
    await runStory(scene, sentence);

    sentence.textContent = "";
    const end = document.createElement("div");
    end.className = "end";
    const title = document.createElement("div");
    title.textContent = "Slut!";
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "Tillbaka";
    // No album yet, so "back" restarts the story.
    back.addEventListener("click", () => void play());
    end.append(title, back);
    stage.append(end);
  };
  void play();
}
