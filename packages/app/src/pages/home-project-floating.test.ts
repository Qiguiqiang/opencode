import { describe, expect, test } from "bun:test"
import {
  blurFloatingProjectActiveElement,
  clampFloatingProjectPosition,
  defaultFloatingProjectPosition,
  floatingProjectButtonVisualState,
  floatingProjectDestination,
  floatingProjectGestureIntent,
  floatingProjectPositionForMode,
  floatingProjectPositionState,
  floatingProjectPoint,
  floatingProjectSessionDestination,
  routedFloatingProjectSwitchVisible,
  snapFloatingProjectPosition,
} from "./home-project-floating"

const viewport = { width: 390, height: 844 }

describe("home floating project switch", () => {
  test("places the mobile button on the right in the thumb-reachable area", () => {
    expect(defaultFloatingProjectPosition("mobile")).toEqual({ edge: "right", y: 420 })
  })

  test("clamps vertical position inside safe viewport bounds", () => {
    expect(clampFloatingProjectPosition({ edge: "left", y: -200 }, viewport)).toEqual({ edge: "left", y: 16 })
    expect(clampFloatingProjectPosition({ edge: "right", y: 1000 }, viewport)).toEqual({
      edge: "right",
      y: 784,
    })
  })

  test("snaps pointer position to nearest horizontal edge", () => {
    expect(snapFloatingProjectPosition({ x: 18, y: 240 }, viewport)).toEqual({ edge: "left", y: 240 })
    expect(snapFloatingProjectPosition({ x: 334, y: 240 }, viewport)).toEqual({ edge: "right", y: 240 })
  })

  test("keeps a free horizontal position away from the screen edges", () => {
    expect(snapFloatingProjectPosition({ x: 180, y: 240 }, viewport)).toEqual({ edge: "left", x: 180, y: 240 })
    expect(floatingProjectPoint({ edge: "left", x: 180, y: 240 }, viewport)).toEqual({ x: 180, y: 240 })
  })

  test("clamps free horizontal position inside safe viewport bounds", () => {
    expect(clampFloatingProjectPosition({ edge: "left", x: -20, y: 240 }, viewport)).toEqual({
      edge: "left",
      x: 16,
      y: 240,
    })
    expect(clampFloatingProjectPosition({ edge: "right", x: 500, y: 240 }, viewport)).toEqual({
      edge: "right",
      x: 330,
      y: 240,
    })
  })

  test("resolves independent desktop and mobile positions", () => {
    const state = floatingProjectPositionState({
      desktop: { edge: "left", y: 120 },
      mobile: { edge: "right", y: 220 },
    })

    expect(floatingProjectPositionForMode(state, "desktop")).toEqual({ edge: "left", y: 120 })
    expect(floatingProjectPositionForMode(state, "mobile")).toEqual({ edge: "right", y: 220 })
  })

  test("falls back to mode defaults when persisted state is missing", () => {
    const state = floatingProjectPositionState({})

    expect(floatingProjectPositionForMode(state, "desktop")).toEqual(defaultFloatingProjectPosition("desktop"))
    expect(floatingProjectPositionForMode(state, "mobile")).toEqual(defaultFloatingProjectPosition("mobile"))
  })

  test("converts edge position to viewport point", () => {
    expect(floatingProjectPoint({ edge: "left", y: 100 }, viewport)).toEqual({ x: 16, y: 100 })
    expect(floatingProjectPoint({ edge: "right", y: 100 }, viewport)).toEqual({ x: 330, y: 100 })
  })

  test("keeps the routed switch visible on legacy home and session routes", () => {
    expect(routedFloatingProjectSwitchVisible("legacy", "/")).toBe(true)
    expect(routedFloatingProjectSwitchVisible("legacy", "/project/session")).toBe(true)
    expect(routedFloatingProjectSwitchVisible("new", "/")).toBe(false)
    expect(routedFloatingProjectSwitchVisible("new", "/project")).toBe(true)
  })

  test("opens the legacy project session list when switching projects", () => {
    expect(floatingProjectDestination("legacy", "F:/augment/opencodenetwork")).toBe(
      "/RjovYXVnbWVudC9vcGVuY29kZW5ldHdvcms/session",
    )
    expect(floatingProjectDestination("new", "F:/augment/opencodenetwork")).toBe("/")
  })

  test("keeps long presses in the normal tap or move interaction", () => {
    expect(floatingProjectGestureIntent({ x: 0, y: 0, released: true })).toBe("tap")
    expect(floatingProjectGestureIntent({ x: 8, y: 0, released: false })).toBe("move")
    expect(floatingProjectGestureIntent({ x: 0, y: 0, released: false })).toBe("pending")
  })

  test("opens a selected legacy conversation instead of stopping at its project", () => {
    expect(floatingProjectSessionDestination("legacy", "F:/augment/opencodenetwork", "ses_123")).toBe(
      "/RjovYXVnbWVudC9vcGVuY29kZW5ldHdvcms/session/ses_123",
    )
  })

  test("releases focused text input before opening the floating project flow", () => {
    document.body.innerHTML = `<input data-test="search" />`
    const input = document.querySelector<HTMLInputElement>("[data-test='search']")!
    input.focus()

    expect(document.activeElement).toBe(input)
    expect(blurFloatingProjectActiveElement()).toBe(true)
    expect(document.activeElement).not.toBe(input)
  })

  test("uses a translucent circular button while text input is focused", () => {
    expect(floatingProjectButtonVisualState({ inputFocused: false })).toEqual({
      shape: "rounded-[10px]",
      opacity: "opacity-100",
    })
    expect(floatingProjectButtonVisualState({ inputFocused: true })).toEqual({
      shape: "rounded-full",
      opacity: "opacity-60",
    })
  })
})
