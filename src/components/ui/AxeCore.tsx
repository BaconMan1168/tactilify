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
        axe(React, ReactDOM, 1000)
      })
    }
  }, [])

  return null
}
