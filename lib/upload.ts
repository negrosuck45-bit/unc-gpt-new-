export interface UploadResult {
  url: string
  storedRemotely: boolean
  path?: string
}

export interface UploadOptions {
  folder?: string
  chatId?: string
  allowLocalFallback?: boolean
}

function extensionFor(type: string) {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'image/avif': 'avif', 'image/heic': 'heic', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/ogg': 'ogv',
  }
  return extensions[type] || 'bin'
}

async function asUploadFile(file: File | Blob) {
  if (file instanceof File) return file
  const type = file.type || 'application/octet-stream'
  return new File([file], `attachment.${extensionFor(type)}`, { type })
}

/** Uploads an attachment through the authenticated private-storage API. */
export async function uploadFile(file: File | Blob, opts?: UploadOptions): Promise<UploadResult> {
  const upload = await asUploadFile(file)
  const form = new FormData()
  form.set('file', upload)
  if (opts?.chatId) form.set('chatId', opts.chatId)

  const response = await fetch('/api/storage/upload', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.url) throw new Error('Secure upload failed.')
  return { url: String(result.url), storedRemotely: true, path: typeof result.path === 'string' ? result.path : undefined }
}

/** Convenience uploader for generated data URLs and pasted images. */
export async function uploadDataUrl(dataUrl: string, opts?: UploadOptions): Promise<UploadResult> {
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error('Attachment could not be prepared.')
  return uploadFile(await response.blob(), opts)
}
