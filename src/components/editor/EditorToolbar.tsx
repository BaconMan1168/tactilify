'use client'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export type EditorTool = 'select' | 'rect' | 'circle' | 'arrow' | 'text'

interface ToolButtonProps {
  tool: EditorTool | 'undo' | 'redo' | 'delete'
  label: string
  shortcut: string
  isActive?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ label, shortcut, isActive, disabled, onClick, children }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={label}
          aria-pressed={isActive}
          disabled={disabled}
          onClick={onClick}
          className="w-8 h-8 p-0"
          style={{
            background: isActive ? '#18191a' : 'transparent',
            color: isActive ? '#f7f8f8' : '#8a8f98',
            border: isActive ? '1px solid #5e6ad2' : '1px solid transparent',
            borderRadius: 6,
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        style={{ background: '#18191a', border: '1px solid #23252a', color: '#f7f8f8', fontSize: 12 }}
      >
        {label} <span style={{ color: '#8a8f98', marginLeft: 4 }}>{shortcut}</span>
      </TooltipContent>
    </Tooltip>
  )
}

interface EditorToolbarProps {
  activeTool: EditorTool
  canUndo: boolean
  canRedo: boolean
  onToolChange: (tool: EditorTool) => void
  onUndo: () => void
  onRedo: () => void
  onDelete: () => void
}

export function EditorToolbar({
  activeTool,
  canUndo,
  canRedo,
  onToolChange,
  onUndo,
  onRedo,
  onDelete,
}: EditorToolbarProps) {
  return (
    <TooltipProvider delayDuration={400}>
      <div
        className="flex flex-col items-center gap-1 py-3 px-2"
        style={{ background: '#0f1011', borderRight: '1px solid #23252a', width: 48 }}
        role="toolbar"
        aria-label="Editor tools"
      >
        <ToolButton tool="select" label="Select" shortcut="V" isActive={activeTool === 'select'} onClick={() => onToolChange('select')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 3l14 9-7 1-4 7z"/>
          </svg>
        </ToolButton>

        <Separator style={{ background: '#23252a', margin: '4px 0', width: 24 }} />

        <ToolButton tool="rect" label="Rectangle" shortcut="R" isActive={activeTool === 'rect'} onClick={() => onToolChange('rect')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18"/>
          </svg>
        </ToolButton>

        <ToolButton tool="circle" label="Circle" shortcut="C" isActive={activeTool === 'circle'} onClick={() => onToolChange('circle')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/>
          </svg>
        </ToolButton>

        <ToolButton tool="arrow" label="Arrow" shortcut="A" isActive={activeTool === 'arrow'} onClick={() => onToolChange('arrow')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12,5 19,12 12,19"/>
          </svg>
        </ToolButton>

        <ToolButton tool="text" label="Text" shortcut="T" isActive={activeTool === 'text'} onClick={() => onToolChange('text')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="4,7 4,4 20,4 20,7"/>
            <line x1="9" y1="20" x2="15" y2="20"/>
            <line x1="12" y1="4" x2="12" y2="20"/>
          </svg>
        </ToolButton>

        <Separator style={{ background: '#23252a', margin: '4px 0', width: 24 }} />

        <ToolButton tool="undo" label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={onUndo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="9,14 4,9 9,4"/>
            <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
          </svg>
        </ToolButton>

        <ToolButton tool="redo" label="Redo" shortcut="⌘⇧Z" disabled={!canRedo} onClick={onRedo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="15,14 20,9 15,4"/>
            <path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
          </svg>
        </ToolButton>

        <Separator style={{ background: '#23252a', margin: '4px 0', width: 24 }} />

        <ToolButton tool="delete" label="Delete selected" shortcut="⌫" onClick={onDelete}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </ToolButton>
      </div>
    </TooltipProvider>
  )
}
