'use client'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import type { UploadedImage } from '@/types/diagram'

interface ImageUploaderProps {
  onUpload: (image: UploadedImage) => void
  isProcessing: boolean
  onProcessingChange: (v: boolean) => void
}

const ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
}

export function ImageUploader({
  onUpload,
  isProcessing,
  onProcessingChange,
}: ImageUploaderProps) {
  const [dragError, setDragError] = useState(false)

  const processFile = useCallback(
    async (file: File) => {
      onProcessingChange(true)
      const formData = new FormData()
      formData.append('file', file)

      try {
        const res = await fetch('/api/preprocess', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? 'Upload failed.')
          return
        }
        onUpload(data as UploadedImage)
      } catch {
        toast.error('Network error. Please try again.')
      } finally {
        onProcessingChange(false)
      }
    },
    [onUpload, onProcessingChange],
  )

  const onDrop = useCallback(
    (accepted: File[], rejected: { file: File }[]) => {
      setDragError(false)
      if (rejected.length > 0) {
        toast.error('Unsupported file type. Use JPEG, PNG, WebP, or PDF.')
        setDragError(true)
        return
      }
      if (accepted[0]) processFile(accepted[0])
    },
    [processFile],
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: ACCEPT,
      maxFiles: 1,
      disabled: isProcessing,
    })

  const isErrorState = isDragReject || dragError

  return (
    <div
      {...getRootProps()}
      role="button"
      aria-label="Upload diagram. Drag and drop or click to browse. Accepts JPEG, PNG, WebP, and PDF."
      aria-disabled={isProcessing}
      className={[
        'relative flex flex-col items-center justify-center gap-4',
        'min-h-[240px] w-full rounded-lg border px-6 py-10',
        'cursor-pointer transition-colors duration-150 outline-none',
        'focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus)]',
        isDragActive && !isErrorState
          ? 'border-[var(--color-primary)] bg-[var(--color-surface-2)]'
          : isErrorState
            ? 'border-red-500 bg-red-500/5'
            : 'border-dashed border-[var(--color-hairline-strong)] bg-[var(--color-surface-1)] hover:border-[var(--color-hairline-tertiary)] hover:bg-[var(--color-surface-2)]',
        isProcessing ? 'pointer-events-none opacity-60' : '',
      ].join(' ')}
    >
      <input {...getInputProps()} />

      <AnimatePresence mode="wait">
        {isProcessing ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3"
          >
            <svg
              aria-hidden="true"
              className="h-8 w-8 animate-spin text-[var(--color-primary)]"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-sm text-[var(--color-ink-subtle)]">Processing…</p>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3 text-center"
          >
            <svg
              aria-hidden="true"
              className={[
                'h-10 w-10',
                isDragActive && !isErrorState
                  ? 'text-[var(--color-primary)]'
                  : isErrorState
                    ? 'text-red-400'
                    : 'text-[var(--color-ink-subtle)]',
              ].join(' ')}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 16.5V18a2 2 0 002 2h12a2 2 0 002-2v-1.5" />
              <path d="M12 3v12" />
              <path d="M8 7l4-4 4 4" />
            </svg>
            <div>
              <p className="text-[15px] font-medium text-[var(--color-ink)]">
                {isDragActive ? 'Drop to process' : 'Drag a diagram here'}
              </p>
              <p className="mt-1 text-[13px] text-[var(--color-ink-subtle)]">
                or{' '}
                <span className="text-[var(--color-primary)] underline underline-offset-2">
                  click to browse
                </span>
              </p>
            </div>
            <p className="text-[11px] tracking-wide text-[var(--color-ink-tertiary)] uppercase">
              JPEG · PNG · WebP · PDF
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
