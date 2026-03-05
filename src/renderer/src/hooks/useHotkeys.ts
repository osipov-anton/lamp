import { useEffect } from 'react'

export interface Hotkey {
  key: string
  meta?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  when?: () => boolean
}

export function useHotkeys(hotkeys: Hotkey[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const hk of hotkeys) {
        const metaMatch = hk.meta ? e.metaKey || e.ctrlKey : !e.metaKey && !e.ctrlKey
        const shiftMatch = hk.shift ? e.shiftKey : !e.shiftKey
        const altMatch = hk.alt ? e.altKey : !e.altKey
        const keyMatch = e.key.toLowerCase() === hk.key.toLowerCase()

        if (keyMatch && metaMatch && shiftMatch && altMatch) {
          if (hk.when && !hk.when()) continue
          e.preventDefault()
          e.stopPropagation()
          hk.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [hotkeys])
}
