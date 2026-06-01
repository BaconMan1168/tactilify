'use client'
import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import type { UploadedImage } from '@/types/diagram'

interface ImageUploaderProps {
  onUpload: (image: UploadedImage) => void
  isProcessing: boolean
  onProcessingChange: (v: boolean) => void
  onCameraRequest: () => void
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
  onCameraRequest,
}: ImageUploaderProps) {
  const processFile = useCallback(
    async (file: File) => {
      onProcessingChange(true)
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await fetch('/api/preprocess', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) { toast.error(data.error ?? 'Upload failed.'); return }
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
      if (rejected.length > 0) { toast.error('Unsupported type. Use JPEG, PNG, WebP, or PDF.'); return }
      if (accepted[0]) processFile(accepted[0])
    },
    [processFile],
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    disabled: isProcessing,
  })

  const isError = isDragReject

  return (
    <div
      className="w-[400px] shrink-0 rounded-[10px] p-[14px]"
      style={{
        background: 'rgba(15,16,17,0.92)',
        border: '1px solid #23252a',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Drop zone */}
      <div
        {...getRootProps()}
        role="button"
        aria-label="Upload diagram — drag and drop or click to browse. Accepts JPEG, PNG, WebP, PDF."
        aria-disabled={isProcessing}
        className={[
          'rounded-[7px] px-3 py-10 min-h-[180px] flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-150 outline-none mb-[9px]',
          'focus-visible:ring-2 focus-visible:ring-[#5e6ad2]',
          isProcessing ? 'pointer-events-none opacity-60' : '',
          isDragActive && !isError
            ? 'border border-dashed border-[#5e6ad2] bg-[rgba(94,106,210,0.06)]'
            : isError
              ? 'border border-dashed border-red-500 bg-[rgba(239,68,68,0.05)]'
              : 'border border-dashed border-[#34343a] hover:border-[#3e3e44]',
        ].join(' ')}
      >
        <input {...getInputProps()} />
        {isProcessing ? (
          <p className="text-[11px] text-[#62666d]">Processing…</p>
        ) : isDragActive ? (
          <p className="text-[11px] text-[#5e6ad2]">Drop to process</p>
        ) : (
          <>
            <p className="text-[11px] text-[#62666d]">
              Drop file or{' '}
              <span className="text-[#5e6ad2]">browse</span>
            </p>
            <p className="text-[9px] text-[#3e3e44] mt-0.5">JPEG · PNG · WebP · PDF</p>
          </>
        )}
      </div>

      {/* Camera toggle */}
      <button
        onClick={onCameraRequest}
        disabled={isProcessing}
        aria-label="Switch to camera input"
        className="w-full text-center text-[11px] text-[#8a8f98] bg-transparent border-none cursor-pointer hover:text-[#f7f8f8] transition-colors disabled:opacity-40"
      >
        Use camera instead
      </button>
    </div>
  )
}
