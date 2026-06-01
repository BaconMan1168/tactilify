'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { UploadedImage } from '@/types/diagram'

interface CameraCaptureProps {
  onCapture: (image: UploadedImage) => void
  isProcessing: boolean
  onProcessingChange: (v: boolean) => void
}

type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable'

export function CameraCapture({
  onCapture,
  isProcessing,
  onProcessingChange,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setCameraState] = useState<CameraState>('idle')

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopStream(), [stopStream])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable')
      return
    }
    setCameraState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraState('active')
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      setCameraState(name === 'NotAllowedError' ? 'denied' : 'unavailable')
    }
  }, [])

  const captureFrame = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) {
        toast.error('Failed to capture frame.')
        return
      }
      stopStream()
      setCameraState('idle')
      onProcessingChange(true)

      const formData = new FormData()
      formData.append('file', new File([blob], 'capture.jpg', { type: 'image/jpeg' }))

      try {
        const res = await fetch('/api/preprocess', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error ?? 'Capture failed.')
          return
        }
        onCapture(data as UploadedImage)
      } catch {
        toast.error('Network error. Please try again.')
      } finally {
        onProcessingChange(false)
      }
    }, 'image/jpeg', 0.92)
  }, [stopStream, onCapture, onProcessingChange])

  if (state === 'unavailable') {
    return (
      <div
        role="alert"
        className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-[var(--color-hairline-strong)] bg-[var(--color-surface-1)] px-6 py-10"
      >
        <p className="text-sm text-[var(--color-ink-subtle)]">
          Camera not available on this device or browser.
        </p>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div
        role="alert"
        className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-hairline-strong)] bg-[var(--color-surface-1)] px-6 py-10"
      >
        <p className="text-sm text-[var(--color-ink-subtle)]">
          Camera access was denied.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCameraState('idle')}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (state === 'idle' || state === 'requesting') {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-[var(--color-hairline-strong)] bg-[var(--color-surface-1)] px-6 py-10">
        <svg
          aria-hidden="true"
          className="h-10 w-10 text-[var(--color-ink-subtle)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
        <div className="text-center">
          <p className="text-[15px] font-medium text-[var(--color-ink)]">
            Photograph a diagram
          </p>
          <p className="mt-1 text-[13px] text-[var(--color-ink-subtle)]">
            Point your camera at a STEM diagram
          </p>
        </div>
        <Button
          onClick={startCamera}
          disabled={state === 'requesting' || isProcessing}
          aria-label="Open camera"
          className="mt-1"
        >
          {state === 'requesting' ? 'Requesting access…' : 'Open camera'}
        </Button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-3"
    >
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          aria-label="Camera preview"
          playsInline
          muted
          className="w-full"
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      </div>
      <div className="flex gap-2">
        <Button
          onClick={captureFrame}
          disabled={isProcessing}
          aria-label="Capture frame"
          className="flex-1"
        >
          Capture
        </Button>
        <Button
          variant="secondary"
          onClick={() => { stopStream(); setCameraState('idle') }}
          aria-label="Cancel camera"
        >
          Cancel
        </Button>
      </div>
    </motion.div>
  )
}
