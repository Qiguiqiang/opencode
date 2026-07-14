import { describe, expect, test } from "bun:test"
import { floatingProjectGestureIntent } from "./home-project-floating"

describe("home floating project switch adversarial boundaries", () => {
  const cases = [
    ["7px remains pending", () => expect(floatingProjectGestureIntent({ x: 7, y: 0 })).toBe("pending")],
    ["8px enters move", () => expect(floatingProjectGestureIntent({ x: 8, y: 0 })).toBe("move")],
    ["stationary press remains pending", () => expect(floatingProjectGestureIntent({ x: 0, y: 0 })).toBe("pending")],
    [
      "movement wins at the joint boundary",
      () => expect(floatingProjectGestureIntent({ x: 8, y: 0 })).toBe("move"),
    ],
    [
      "released jitter is a tap",
      () => expect(floatingProjectGestureIntent({ x: 3, y: 4, released: true })).toBe("tap"),
    ],
  ] as const

  for (const [name, run] of cases) test(name, run)
})
