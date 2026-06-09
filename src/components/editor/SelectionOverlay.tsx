'use client'
import type { BBox } from '@/types/editor'

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLE = 8

function cursor(pos: HandlePosition): string {
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
      strokeWidth={1}
      rx={1}
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
  svgW: number
  svgH: number
  onResizeStart: (pos: HandlePosition, clientX: number, clientY: number) => void
}

export function SelectionOverlay({ bbox, svgW, svgH, onResizeStart }: SelectionOverlayProps) {
  const { x, y, width, height } = bbox
  const mx = x + width / 2
  const my = y + height / 2
  const handles: Array<{ pos: HandlePosition; cx: number; cy: number }> = [
    { pos: 'nw', cx: x,         cy: y         },
    { pos: 'n',  cx: mx,        cy: y         },
    { pos: 'ne', cx: x + width, cy: y         },
    { pos: 'e',  cx: x + width, cy: my        },
    { pos: 'se', cx: x + width, cy: y + height },
    { pos: 's',  cx: mx,        cy: y + height },
    { pos: 'sw', cx: x,         cy: y + height },
    { pos: 'w',  cx: x,         cy: my        },
  ]

  return (
    <svg
      style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      aria-hidden="true"
    >
      {/* Selection outline — purely visual, no pointer events */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="rgba(94,106,210,0.05)"
        stroke="#5e6ad2"
        strokeWidth={1.5}
        strokeDasharray="6 3"
        style={{ pointerEvents: 'none' }}
      />
      {handles.map(h => (
        <Handle key={h.pos} cx={h.cx} cy={h.cy} pos={h.pos} onDragStart={onResizeStart} />
      ))}
    </svg>
  )
}
