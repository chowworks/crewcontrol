import { useEffect, useState } from 'react'
import { api } from './api'

/**
 * Whether Travel HQ is in its limited preview (System Settings, issue #39): null until it's known. If it can't be
 * read, the preview stays on, as the API would refuse a trip anyway.
 */
export function useLimitedPreview(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    api
      .publicSettings()
      .then((s) => setOn(s.limitedPreview))
      .catch(() => setOn(true))
  }, [])
  return on
}
