export const POPOVER_WIDTH = 240
export const POPOVER_MAX_HEIGHT = 320
export const POPOVER_GAP = 4
export const POPOVER_MARGIN = 8
export const POPOVER_Z_INDEX = 1100

export interface RectLike {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface ViewportLike {
  width: number
  height: number
}

export interface PopoverPlacement {
  left: number
  width: number
  maxHeight: number
  /** Distance from the viewport bottom; used when the panel sits above the trigger. */
  bottom?: number
  /** Distance from the viewport top; used only when there is not enough room above. */
  top?: number
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * Sit a compact menu on the trigger. Prefer above it, growing upward, so a
 * changing list height does not jump from the top of the viewport.
 */
export function positionSessionPopover(input: {
  anchor: RectLike
  viewport: ViewportLike
  wide: boolean
  width?: number
  height?: number
  gap?: number
  margin?: number
}): PopoverPlacement {
  const width = input.width ?? Math.max(input.anchor.width, POPOVER_WIDTH)
  void input.wide
  const cap = Math.min(input.height ?? POPOVER_MAX_HEIGHT, POPOVER_MAX_HEIGHT)
  const gap = input.gap ?? POPOVER_GAP
  const margin = input.margin ?? POPOVER_MARGIN
  const maxLeft = Math.max(margin, input.viewport.width - width - margin)
  const left = clamp(input.anchor.left, margin, maxLeft)
  const spaceAbove = input.anchor.top - gap - margin
  const spaceBelow = input.viewport.height - input.anchor.bottom - gap - margin
  const preferAbove = spaceAbove >= 96 || spaceAbove >= spaceBelow

  if (preferAbove && spaceAbove > 0) {
    return {
      left,
      width,
      maxHeight: Math.max(96, Math.min(cap, spaceAbove)),
      bottom: input.viewport.height - input.anchor.top + gap,
    }
  }

  return {
    left,
    width,
    maxHeight: Math.max(96, Math.min(cap, Math.max(spaceBelow, 96))),
    top: clamp(input.anchor.bottom + gap, margin, Math.max(margin, input.viewport.height - 96 - margin)),
  }
}
