'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import type { UploadedImage } from '@/types/diagram'

interface CameraCaptureProps {
  onCapture: (image: UploadedImage) => void
  isProcessing: boolean
  onProcessingChange: (v: boolean) => void
  onBack?: () => void
}

type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable'

export function CameraCapture({
  onCapture,
  isProcessing,
  onProcessingChange,
  onBack,
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

  // Assign srcObject once the video element exists in the DOM (after state → 'active')
  useEffect(() => {
    if (state === 'active' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [state])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable')
      return
    }
    setCameraState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // ideal: lets browser pick rear camera on mobile, falls back to front on MacBook
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      })
      streamRef.current = stream
      setCameraState('active') // renders <video>; useEffect above sets srcObject
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      setCameraState(name === 'NotAllowedError' ? 'denied' : 'unavailable')
    }
  }, [])

  const captureFrame = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    if (video.videoWidth === 0) { toast.error('Camera not ready yet — please wait a moment.'); return }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) { toast.error('Failed to capture frame.'); return }
      stopStream()
      setCameraState('idle')
      onProcessingChange(true)

      const formData = new FormData()
      formData.append('file', new File([blob], 'capture.jpg', { type: 'image/jpeg' }))

      try {
        const res = await fetch('/api/preprocess', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) { toast.error(data.error ?? 'Capture failed.'); return }
        onCapture(data as UploadedImage)
      } catch {
        toast.error('Network error. Please try again.')
      } finally {
        onProcessingChange(false)
      }
    }, 'image/jpeg', 0.92)
  }, [stopStream, onCapture, onProcessingChange])

  const cardStyle = {
    background: 'rgba(15,16,17,0.92)',
    border: '1px solid #23252a',
    backdropFilter: 'blur(10px)',
  }

  if (state === 'active') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-[400px] shrink-0 rounded-[10px] overflow-hidden flex flex-col"
        style={cardStyle}
      >
        <div className="relative overflow-hidden bg-black">
          <video
            ref={videoRef}
            aria-label="Camera live view"
            playsInline
            muted
            className="w-full block"
          />
          <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
        </div>
        <div className="flex gap-1.5 p-2">
          <button
            onClick={captureFrame}
            disabled={isProcessing}
            aria-label="Capture frame"
            className="flex-1 text-[11px] text-white font-medium rounded-[6px] py-2 transition-colors disabled:opacity-40"
            style={{ background: '#5e6ad2' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#828fff')}
            onMouseLeave={e => (e.currentTarget.style.background = '#5e6ad2')}
          >
            {isProcessing ? 'Processing…' : 'Capture'}
          </button>
          <button
            onClick={() => { stopStream(); setCameraState('idle') }}
            aria-label="Cancel camera"
            className="text-[11px] text-[#8a8f98] bg-[#18191a] border border-[#23252a] rounded-[6px] px-3 py-2 hover:text-[#f7f8f8] transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <div
      className="w-[400px] shrink-0 rounded-[10px] p-[14px] flex flex-col gap-[9px]"
      style={cardStyle}
    >
      {/* Status area */}
      <div
        className="rounded-[7px] px-3 py-10 text-center border border-dashed border-[#34343a]"
        role={state === 'denied' || state === 'unavailable' ? 'alert' : undefined}
      >
        {state === 'denied' && (
          <p className="text-[11px] text-[#8a8f98]">Camera access denied. Check browser permissions.</p>
        )}
        {state === 'unavailable' && (
          <p className="text-[11px] text-[#8a8f98]">Camera unavailable on this device.</p>
        )}
        {(state === 'idle' || state === 'requesting') && (
          <>
            <p className="text-[11px] text-[#62666d]">
              {state === 'requesting' ? 'Requesting access…' : 'Point camera at a diagram'}
            </p>
            <button
              onClick={startCamera}
              disabled={state === 'requesting' || isProcessing}
              aria-label="Open camera"
              className="mt-2 text-[11px] text-[#5e6ad2] bg-transparent border-none cursor-pointer hover:text-[#828fff] transition-colors disabled:opacity-40"
            >
              {state === 'requesting' ? 'Opening…' : 'Open camera'}
            </button>
          </>
        )}
      </div>

      {/* Back to upload */}
      <button
        onClick={onBack}
        disabled={isProcessing}
        aria-label="Switch back to file upload"
        className="w-full text-center text-[11px] text-[#8a8f98] bg-transparent border-none cursor-pointer hover:text-[#f7f8f8] transition-colors disabled:opacity-40"
      >
        Upload a file instead
      </button>
    </div>
  )
}
