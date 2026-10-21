// Story 1 ("Katten och tofflan"), hardcoded. The scene is a list of entities
// with positions and anchors so it can be turned into data later.
import "./styles/scene.css";
import {
  ANCHOR_KINDS,
  aboveHost,
  anchorRect,
  boxOf,
  createScene,
  isBehind,
  must,
  sameRef,
  type AnchorKind,
  type AnchorRef,
  type Entity,
  type Rect,
  type Tap,
} from "./scene";

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

const W = 1000;
const H = 600;
const FLOOR = 590;

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

export const ENTITIES: Entity[] = [
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
  { id: "toffla", kind: "item", emoji: "🩴", size: 70, x: 120, y: 585 },
  { id: "strumpa", kind: "item", emoji: "🧦", size: 70, x: 400, y: 585 },
  { id: "boll", kind: "item", emoji: "⚽", size: 70, x: 700, y: 585 },
  { id: "hatt", kind: "item", emoji: "🎩", size: 70, x: 850, y: 585 },
  { id: "anka", kind: "item", emoji: "🦆", size: 80, x: 0, y: 0, hidden: true },
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

const MISTAKES = ["spin", "topple", "shake", "recoil"] as const;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Dev check: anchor rects of one host must not overlap. For "behind" and "in"
// only the part that sticks out above the host counts, the rest is hidden by it.
function warnOverlappingAnchors(): void {
  const TOLERANCE = 4;
  for (const e of ENTITIES) {
    const kinds = ANCHOR_KINDS.filter((k) => e.anchors?.[k]);
    if (kinds.includes("in") && kinds.includes("behind")) {
      console.warn(`${e.id} has both "in" and "behind"; a host may only have one of them`);
    }
    const visible = (k: AnchorKind): Rect => {
      const r = anchorRect(e, k);
      return isBehind(k) ? aboveHost(e, r) : r;
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

// Dev check: actors must be figures, objects must be items.
function checkRoles(): void {
  const kindOf = (id: string) => ENTITIES.find((e) => e.id === id)?.kind;
  STEPS.forEach((step, i) => {
    if (step.actor !== undefined && kindOf(step.actor) !== "figure") {
      console.error(`Step ${i + 1}: actor "${step.actor}" must be a figure, is ${kindOf(step.actor)}`);
    }
    if (step.object !== undefined && kindOf(step.object) !== "item") {
      console.error(`Step ${i + 1}: object "${step.object}" must be an item, is ${kindOf(step.object)}`);
    }
  });
}

function isCorrect(step: ActionStep, a: Tap, b: Tap): boolean {
  const first = step.verb === "put" ? step.object : step.actor;
  if (a.kind !== "entity" || a.id !== first) return false;
  if (step.verb === "take") return b.kind === "entity" && b.id === step.object;
  return b.kind === "anchor" && step.target !== undefined && sameRef(b.ref, step.target);
}

// Plays the story in `scene`. Resolves when the finale is done.
function runStory(scene: HTMLElement, sentence: HTMLElement): Promise<void> {
  const model = createScene(ENTITIES);
  const { def, absPos, free, hold, attach } = model;

  const nodes = new Map<string, { el: HTMLElement; glyph: HTMLElement }>();
  const node = (id: string) => must(nodes.get(id), `node ${id}`);
  const zones: { el: HTMLElement; ref: AnchorRef }[] = [];

  for (const e of ENTITIES) {
    const el = document.createElement("div");
    el.className = e.kind === "place" ? "ent place" : "ent";
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

    for (const ref of model.anchorRefs.filter((r) => r.entity === e.id)) {
      const zone = document.createElement("div");
      zone.className = "anchor";
      zone.dataset.anchor = `${ref.entity}.${ref.anchor}`;
      scene.append(zone);
      zones.push({ el: zone, ref });
    }
  }

  // --- Rendering ---

  function render(): void {
    for (const e of ENTITIES) {
      const { el } = node(e.id);
      const p = absPos(e.id);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.zIndex = String(model.zOf(e.id));
    }
    for (const { el, ref } of zones) {
      const r = model.anchorBox(ref);
      el.style.left = `${r.x}px`;
      el.style.top = `${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
      el.style.zIndex = String(model.zoneZ(ref));
    }
  }

  function setDuration(ids: string[], ms: number): void {
    for (const id of ids) node(id).el.style.transitionDuration = `${ms}ms`;
    for (const z of zones) if (ids.includes(z.ref.entity)) z.el.style.transitionDuration = `${ms}ms`;
  }

  async function slide(id: string, mutate: () => void, ms: number): Promise<void> {
    mutate();
    const ids = model.group(id);
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
    model.show(id);
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
        const holder = model.holderOf(object);
        if (holder) {
          const d = model.dropPoint(target);
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
      // Client coordinates to virtual scene coordinates.
      const r = scene.getBoundingClientRect();
      const s = r.width / W;
      const tap = model.hit({ x: (event.clientX - r.left) / s, y: (event.clientY - r.top) / s });
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
  if (import.meta.env.DEV) {
    warnOverlappingAnchors();
    checkRoles();
  }
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
