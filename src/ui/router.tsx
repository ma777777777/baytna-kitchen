import { useCallback, useEffect, useState } from 'react'

function read() {
  const h = window.location.hash.replace(/^#\/?/, '')
  return h ? h.split('/').map(decodeURIComponent) : ['today']
}

export function useRoute() {
  const [route, setRoute] = useState<string[]>(read)
  useEffect(() => {
    const on = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(path: string) {
  window.location.hash = `#/${path}`
}

export function useBack() {
  return useCallback(() => {
    if (window.history.length > 1) window.history.back()
    else go('today')
  }, [])
}
