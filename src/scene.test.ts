import { describe, expect, it } from "vitest";
import { boxOf, createScene } from "./scene";
import { ENTITIES } from "./story1";

describe("hit", () => {
  const sofa = () => {
    const scene = createScene(ENTITIES);
    const p = scene.absPos("soffa");
    return { scene, p, ...boxOf(scene.def("soffa")) };
  };

  it("hits pappa in the middle of the bathtub when he is in it", () => {
    const scene = createScene(ENTITIES);
    scene.attach("pappa", { entity: "badkar", anchor: "in" });
    const tub = scene.absPos("badkar");
    const { h } = boxOf(scene.def("badkar"));
    expect(scene.hit({ x: tub.x, y: tub.y - h / 2 })).toEqual({ kind: "entity", id: "pappa" });
  });

  it("hits soffa.on, not soffa.behind, on the seat", () => {
    const { scene, p, h } = sofa();
    // Just above the cushions, where "on" and the hidden part of "behind" both lie.
    expect(scene.hit({ x: p.x, y: p.y - 0.65 * h })).toEqual({
      kind: "anchor",
      ref: { entity: "soffa", anchor: "on" },
    });
  });

  it("hits soffa.behind on the part that sticks out above the sofa", () => {
    const { scene, p, w, h } = sofa();
    expect(scene.hit({ x: p.x + 0.15 * w, y: p.y - 1.1 * h })).toEqual({
      kind: "anchor",
      ref: { entity: "soffa", anchor: "behind" },
    });
  });
});
