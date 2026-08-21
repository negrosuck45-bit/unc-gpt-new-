'use client'

import { useEffect } from 'react'
import { readUserPreferences, subscribeToUserPreferences } from '@/lib/user-preferences'

export function CustomCursor() {
  useEffect(() => {
    const apply = () => {
      const image = readUserPreferences().customCursorImage
      if (image) {
        document.documentElement.style.setProperty('--uncgpt-custom-cursor', `url("${image}")`)
        document.documentElement.classList.add('has-custom-cursor')
      } else {
        document.documentElement.style.removeProperty('--uncgpt-custom-cursor')
        document.documentElement.classList.remove('has-custom-cursor')
      }
    }
    apply()
    return subscribeToUserPreferences(apply)
  }, [])

  return null
}
