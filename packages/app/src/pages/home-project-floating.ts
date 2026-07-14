import { base64Encode } from "@opencode-ai/core/util/encode"

export type FloatingProjectMode = "desktop" | "mobile"
export type FloatingProjectRouteMode = "new" | "legacy"
export type FloatingProjectEdge = "left" | "right"
export type FloatingProjectPosition = { edge: FloatingProjectEdge; y: number; x?: number }
export type FloatingProjectPositionState = Partial<Record<FloatingProjectMode, FloatingProjectPosition>>
export type FloatingProjectViewport = { width: number; height: number }
export type FloatingProjectPoint = { x: number; y: number }
export type FloatingProjectGestureIntent = "pending" | "tap" | "move"

const FLOATING_PROJECT_BUTTON_SIZE = 44
const FLOATING_PROJECT_MARGIN = 16
const FLOATING_PROJECT_EDGE_SNAP_DISTANCE = 24
export const FLOATING_PROJECT_MOVE_THRESHOLD = 8

export function defaultFloatingProjectPosition(mode: FloatingProjectMode): FloatingProjectPosition {
  if (mode === "mobile") return { edge: "right", y: 420 }
  return { edge: "left", y: 112 }
}

export function floatingProjectPositionState(state: FloatingProjectPositionState) {
  return {
    desktop: state.desktop ?? defaultFloatingProjectPosition("desktop"),
    mobile: state.mobile ?? defaultFloatingProjectPosition("mobile"),
  }
}

export function floatingProjectPositionForMode(state: FloatingProjectPositionState, mode: FloatingProjectMode) {
  return floatingProjectPositionState(state)[mode]
}

export function clampFloatingProjectPosition(
  position: FloatingProjectPosition,
  viewport: FloatingProjectViewport,
): FloatingProjectPosition {
  return {
    edge: position.edge,
    ...(position.x === undefined
      ? {}
      : {
          x: clamp(
            position.x,
            FLOATING_PROJECT_MARGIN,
            viewport.width - FLOATING_PROJECT_MARGIN - FLOATING_PROJECT_BUTTON_SIZE,
          ),
        }),
    y: clamp(position.y, FLOATING_PROJECT_MARGIN, viewport.height - FLOATING_PROJECT_MARGIN - FLOATING_PROJECT_BUTTON_SIZE),
  }
}

export function snapFloatingProjectPosition(
  point: FloatingProjectPoint,
  viewport: FloatingProjectViewport,
): FloatingProjectPosition {
  const leftSnap = FLOATING_PROJECT_MARGIN + FLOATING_PROJECT_EDGE_SNAP_DISTANCE
  const rightSnap =
    viewport.width - FLOATING_PROJECT_MARGIN - FLOATING_PROJECT_BUTTON_SIZE - FLOATING_PROJECT_EDGE_SNAP_DISTANCE
  if (point.x <= leftSnap) return clampFloatingProjectPosition({ edge: "left", y: point.y }, viewport)
  if (point.x >= rightSnap) return clampFloatingProjectPosition({ edge: "right", y: point.y }, viewport)
  return clampFloatingProjectPosition(
    {
      edge: point.x < viewport.width / 2 ? "left" : "right",
      x: point.x,
      y: point.y,
    },
    viewport,
  )
}

export function floatingProjectPoint(position: FloatingProjectPosition, viewport: FloatingProjectViewport) {
  if (position.x !== undefined) {
    return {
      x: clamp(position.x, FLOATING_PROJECT_MARGIN, viewport.width - FLOATING_PROJECT_MARGIN - FLOATING_PROJECT_BUTTON_SIZE),
      y: position.y,
    }
  }
  return {
    x:
      position.edge === "left"
        ? FLOATING_PROJECT_MARGIN
        : viewport.width - FLOATING_PROJECT_MARGIN - FLOATING_PROJECT_BUTTON_SIZE,
    y: position.y,
  }
}

export function routedFloatingProjectSwitchVisible(mode: FloatingProjectRouteMode, pathname: string) {
  return mode === "legacy" || pathname !== "/"
}

export function floatingProjectDestination(mode: FloatingProjectRouteMode, directory: string) {
  if (mode === "legacy") return `/${base64Encode(directory)}/session`
  return "/"
}

export function floatingProjectSessionDestination(
  mode: FloatingProjectRouteMode,
  directory: string,
  sessionID: string,
) {
  if (mode === "legacy") return `/${base64Encode(directory)}/session/${sessionID}`
  return "/"
}

export function floatingProjectGestureIntent(input: {
  x: number
  y: number
  released?: boolean
}): FloatingProjectGestureIntent {
  if (Math.hypot(input.x, input.y) >= FLOATING_PROJECT_MOVE_THRESHOLD) return "move"
  if (input.released) return "tap"
  return "pending"
}

export function floatingProjectButtonVisualState(input: { inputFocused: boolean }) {
  return input.inputFocused
    ? { shape: "rounded-full", opacity: "opacity-60" }
    : { shape: "rounded-[10px]", opacity: "opacity-100" }
}

export function blurFloatingProjectActiveElement(doc: Document = document) {
  const active = doc.activeElement
  if (!(active instanceof HTMLElement)) return false
  if (!isTextInputElement(active)) return false
  active.blur()
  return true
}

export function floatingProjectTextInputFocused(doc: Document = document) {
  const active = doc.activeElement
  return active instanceof HTMLElement && isTextInputElement(active)
}

function isTextInputElement(element: HTMLElement) {
  return /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.isContentEditable
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
