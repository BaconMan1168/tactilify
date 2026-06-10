'use client'
import type { BBox } from '@/types/editor'

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'p1' | 'p2'

const HANDLE = 3 // handle size in SVG user units (mm)
// Minimum visible selection area for tiny elements (e.g. braille dots ~2mm)
const MIN_DISPLAY = 8 // mm

function cursor(pos: HandlePosition): string {
  if (pos === 'p1' || pos === 'p2') return 'crosshair'
  if (pos === 'nw' || pos === 'se') return 'nwse-resize'
  if (pos === 'ne' || pos === 'sw') return 'nesw-resize'
  if (pos === 'n' || pos === 's') return 'ns-resize'
  return 'ew-resize'
}

interface HandleProps {
  cx: number
  cy: number
  pos: HandlePosition
  onDragStart: (pos: HandlePosition, clientX: number, clientY: number) => void
}

function Handle({ cx, cy, pos, onDragStart }: HandleProps) {
  return (
    <rect
      x={cx - HANDLE / 2}
      y={cy - HANDLE / 2}
      width={HANDLE}
      height={HANDLE}
      fill="#5e6ad2"
      stroke="#ffffff"
      strokeWidth={0.4}
      rx={0.4}
      style={{ pointerEvents: 'all', cursor: cursor(pos) }}
      onMouseDown={e => {
        e.stopPropagation()
        onDragStart(pos, e.clientX, e.clientY)
      }}
    />
  )
}

interface SelectionOverlayProps {
  bbox: BBox
  cssW: number
  cssH: number
  vbW: number
  vbH: number
  onResizeStart: (pos: HandlePosition, clientX: number, clientY: number) => void
  onMoveStart?: (clientX: number, clientY: number) => void
  lineCoords?: { x1: number; y1: number; x2: number; y2: number }
}

export function SelectionOverlay({ bbox, cssW, cssH, vbW, vbH, onResizeStart, onMoveStart, lineCoords }: SelectionOverlayProps) {
  // Pad the display bbox for tiny elements so handles are visible and grabable
  const isTiny = bbox.width < MIN_DISPLAY && bbox.height < MIN_DISPLAY
  const displayBbox = isTiny
    ? {
        x: bbox.x - (MIN_DISPLAY - bbox.width) / 2,
        y: bbox.y - (MIN_DISPLAY - bbox.height) / 2,
        width: MIN_DISPLAY,
        height: MIN_DISPLAY,
      }
    : bbox

  const { x, y, width, height } = displayBbox
  const mx = x + width / 2
  const my = y + height / 2

  const stdHandles: Array<{ pos: HandlePosition; cx: number; cy: number }> = [
    { pos: 'nw', cx: x,         cy: y          },
    { pos: 'n',  cx: mx,        cy: y          },
    { pos: 'ne', cx: x + width, cy: y          },
    { pos: 'e',  cx: x + width, cy: my         },
    { pos: 'se', cx: x + width, cy: y + height },
    { pos: 's',  cx: mx,        cy: y + height },
    { pos: 'sw', cx: x,         cy: y + height },
    { pos: 'w',  cx: x,         cy: my         },
  ]

  // For line/arrow elements show draggable endpoint handles instead of bbox handles
  const handlesToRender = lineCoords
    ? [
        { pos: 'p1' as HandlePosition, cx: lineCoords.x1, cy: lineCoords.y1 },
        { pos: 'p2' as HandlePosition, cx: lineCoords.x2, cy: lineCoords.y2 },
      ]
    : stdHandles

  return (
    <svg
      style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
      width={cssW}
      height={cssH}
      viewBox={`0 0 ${vbW} ${vbH}`}
      aria-hidden="true"
    >
      {/* Selection outline */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="rgba(94,106,210,0.05)"
        stroke="#5e6ad2"
        strokeWidth={0.4}
        strokeDasharray="2 1"
        style={{ pointerEvents: 'none' }}
      />
      {/* For tiny elements, fill the padded display area with a transparent drag target
          so the user doesn't have to hit the sub-pixel circles to initiate a move */}
      {isTiny && onMoveStart && (
        <rect
          x={x} y={y} width={width} height={height}
          fill="transparent"
          style={{ pointerEvents: 'all', cursor: 'move' }}
          onMouseDown={e => { e.stopPropagation(); onMoveStart(e.clientX, e.clientY) }}
        />
      )}
      {handlesToRender.map(h => (
        <Handle key={h.pos} cx={h.cx} cy={h.cy} pos={h.pos} onDragStart={onResizeStart} />
      ))}
    </svg>
  )
}
