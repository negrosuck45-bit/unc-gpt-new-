'use client'

import { useEffect, useState } from 'react'
import { getConnectionPlatform, type ProfileConnection } from '@/lib/profile-connections'

type ConnectionsRowProps = {
  connections: ProfileConnection[]
}

async function copyConnectionValue(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

export function ConnectionsRow({ connections }: ConnectionsRowProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null)

  useEffect(() => {
    if (!copiedId && !copyErrorId) return
    const timeout = window.setTimeout(() => {
      setCopiedId(null)
      setCopyErrorId(null)
    }, 1500)
    return () => window.clearTimeout(timeout)
  }, [copiedId, copyErrorId])

  const visibleConnections = connections
    .map((connection) => ({ connection, platform: getConnectionPlatform(connection.platform) }))
    .filter((item): item is { connection: ProfileConnection; platform: NonNullable<ReturnType<typeof getConnectionPlatform>> } => Boolean(item.platform))

  if (!visibleConnections.length) return null

  return (
    <div className="mt-5 flex flex-wrap items-start justify-center gap-3" aria-label="Profile connections">
      {visibleConnections.map(({ connection, platform }) => {
        const Icon = platform.icon
        const copied = copiedId === connection.id
        const copyError = copyErrorId === connection.id
        const label = platform.mode === 'username'
          ? `Copy ${platform.label} username ${connection.value}`
          : `Open ${platform.label}`
        const iconClassName = "flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] transition duration-150 hover:-translate-y-0.5 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"

        return (
          <div key={connection.id} className="relative flex flex-col items-center">
            {platform.mode === 'link' ? (
              <a
                href={connection.value}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={platform.label}
                className={iconClassName}
              >
                <Icon aria-hidden="true" className="h-5 w-5" style={{ color: platform.color }} />
              </a>
            ) : (
              <button
                type="button"
                aria-label={label}
                title={platform.label}
                className={iconClassName}
                onClick={() => {
                  void copyConnectionValue(connection.value)
                    .then(() => setCopiedId(connection.id))
                    .catch(() => setCopyErrorId(connection.id))
                }}
              >
                <Icon aria-hidden="true" className="h-5 w-5" style={{ color: platform.color }} />
              </button>
            )}
            {(copied || copyError) && (
              <span
                role="status"
                className="absolute top-[calc(100%+0.45rem)] z-20 max-w-40 whitespace-nowrap rounded-md border border-white/10 bg-black/85 px-2 py-1 text-[10px] font-medium text-white shadow-lg backdrop-blur"
              >
                {copied ? `Copied ${connection.value}` : 'Could not copy'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
