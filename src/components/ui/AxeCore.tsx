'use client'
import { useEffect } from 'react'

export function AxeCore() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      Promise.all([
        import('@axe-core/react'),
        import('react'),
        import('react-dom'),
      ]).then(([{ default: axe }, React, ReactDOM]) => {
        try {
          axe(React, ReactDOM, 1000)
        } catch {
          // @axe-core/react is incompatible with React 19 (read-only createElement getter)
        }
      })
    }
  }, [])

  return null
}
