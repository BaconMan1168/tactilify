'use client'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface PageNavProps {
  pages: string[]
  currentPage: number
  dirtyPages: Set<number>
  onPageChange: (index: number) => void
}

function pageLabel(index: number, total: number): string {
  if (index === 0) return 'Reference'
  if (total <= 2) return 'Diagram'
  return `Diagram ${index}`
}

export function PageNav({ pages, currentPage, dirtyPages, onPageChange }: PageNavProps) {
  if (pages.length <= 1) return null

  return (
    <div
      style={{ borderTop: '1px solid #23252a', background: '#0f1011', padding: '0 16px' }}
      role="navigation"
      aria-label="Diagram pages"
    >
      <Tabs value={String(currentPage)} onValueChange={v => onPageChange(Number(v))}>
        <TabsList
          className="h-auto gap-0 rounded-none"
          style={{ background: 'transparent', borderBottom: 'none', padding: '0' }}
        >
          {pages.map((_, i) => (
            <TabsTrigger
              key={i}
              value={String(i)}
              className="relative h-auto rounded-none"
              style={{
                fontSize: 13,
                fontWeight: currentPage === i ? 500 : 400,
                padding: '10px 14px',
                color: currentPage === i ? '#f7f8f8' : '#62666d',
                borderBottom: currentPage === i ? '2px solid #5e6ad2' : '2px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
              }}
              aria-label={`${pageLabel(i, pages.length)} page${dirtyPages.has(i) ? ', has unsaved changes' : ''}`}
            >
              {pageLabel(i, pages.length)}
              {dirtyPages.has(i) && (
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#5e6ad2',
                    marginLeft: 6,
                    verticalAlign: 'middle',
                  }}
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
