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
type GuidanceStatus = 'analyzing' | 'blur' | 'dark' | 'bright' | 'unstable' | 'ready'

interface Guidance {
  status: GuidanceStatus
  message: string
  progress: number
}

const ANALYSIS_W = 320
const BLUR_THRESHOLD = 80     // Laplacian variance below this = blurry
const MIN_LUM = 40            // Mean luminance below this = too dark
const MAX_LUM = 220           // Mean luminance above this = too bright
const MOTION_THRESHOLD = 12   // Mean per-channel pixel diff above this = unstable
const STABLE_FRAMES = 15      // ~1.5s at 10fps before auto-capture
const SAMPLE_MS = 100         // ~10fps analysis rate

function grayAt(data: Uint8ClampedArray, x: number, y: number, w: number): number {
  const i = (y * w + x) * 4
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
}

function analyzePixels(
  data: Uint8ClampedArray,
  prev: Uint8ClampedArray | null,
  w: number,
  h: number,
): Omit<Guidance, 'progress'> {
  // Brightness check
  let totalLum = 0
  for (let i = 0; i < data.length; i += 4) {
    totalLum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }
  const meanLum = totalLum / (data.length / 4)
  if (meanLum < MIN_LUM) return { status: 'dark', message: 'Too dark' }
  if (meanLum > MAX_LUM) return { status: 'bright', message: 'Too bright' }

  // Stability check (frame differencing)
  if (prev && prev.length === data.length) {
    let totalDiff = 0
    for (let i = 0; i < data.length; i += 4) {
      totalDiff +=
        (Math.abs(data[i] - prev[i]) +
          Math.abs(data[i + 1] - prev[i + 1]) +
          Math.abs(data[i + 2] - prev[i + 2])) /
        3
    }
    if (totalDiff / (data.length / 4) > MOTION_THRESHOLD) {
      return { status: 'unstable', message: 'Hold steady' }
    }
  }

  // Blur check (Laplacian variance, sampled every 2nd pixel)
  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const lap =
        grayAt(data, x, y - 1, w) +
        grayAt(data, x, y + 1, w) +
        grayAt(data, x - 1, y, w) +
        grayAt(data, x + 1, y, w) -
        4 * grayAt(data, x, y, w)
      sum += lap
      sumSq += lap * lap
      count++
    }
  }
  const mean = sum / count
  const variance = sumSq / count - mean * mean
  if (variance < BLUR_THRESHOLD) return { status: 'blur', message: 'Image is blurry' }

  return { status: 'ready', message: 'Ready' }
}

const GUIDANCE_COLOR: Record<GuidanceStatus, string> = {
  analyzing: '#62666d',
  blur: '#8a8f98',
  dark: '#8a8f98',
  bright: '#8a8f98',
  unstable: '#8a8f98',
  ready: '#27a644',
}

export function CameraCapture({
  onCapture,
  isProcessing,
  onProcessingChange,
  onBack,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null)
  const stableCountRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const isProcessingRef = useRef(isProcessing)
  const captureFrameRef = useRef<() => void>(() => {})

  const [state, setCameraState] = useState<CameraState>('idle')
  const [brightness, setBrightness] = useState(1)
  const [guidance, setGuidance] = useState<Guidance>({
    status: 'analyzing',
    message: 'Analyzing…',
    progress: 0,
  })

  useEffect(() => {
    isProcessingRef.current = isProcessing
  }, [isProcessing])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopStream(), [stopStream])

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
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      })
      streamRef.current = stream
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
    if (video.videoWidth === 0) {
      toast.error('Camera not ready yet — please wait a moment.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)

    canvas.toBlob(
      async (blob) => {
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
          const url = brightness !== 1
          ? `/api/preprocess?brightness=${brightness}`
          : '/api/preprocess'
        const res = await fetch(url, { method: 'POST', body: formData })
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
      },
      'image/jpeg',
      0.92,
    )
  }, [stopStream, onCapture, onProcessingChange])

  useEffect(() => {
    captureFrameRef.current = captureFrame
  }, [captureFrame])

  // Analysis loop — runs while camera is active
  useEffect(() => {
    if (state !== 'active') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      prevFrameRef.current = null
      stableCountRef.current = 0
      return
    }

    let lastTime = 0
    let ctx: CanvasRenderingContext2D | null = null

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop)
      if (now - lastTime < SAMPLE_MS) return
      lastTime = now

      const video = videoRef.current
      const canvas = analysisCanvasRef.current
      if (!video || !canvas || video.videoWidth === 0) return

      if (!ctx) ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      const h = Math.round(video.videoHeight * (ANALYSIS_W / video.videoWidth))
      canvas.width = ANALYSIS_W
      canvas.height = h
      ctx.drawImage(video, 0, 0, ANALYSIS_W, h)

      const { data } = ctx.getImageData(0, 0, ANALYSIS_W, h)
      const result = analyzePixels(data, prevFrameRef.current, ANALYSIS_W, h)
      prevFrameRef.current = new Uint8ClampedArray(data)

      if (result.status === 'ready') {
        stableCountRef.current = Math.min(stableCountRef.current + 1, STABLE_FRAMES)
        const progress = Math.round((stableCountRef.current / STABLE_FRAMES) * 100)
        setGuidance({ status: 'ready', message: 'Ready', progress })
      } else {
        stableCountRef.current = 0
        setGuidance({ ...result, progress: 0 })
      }
    }

    setGuidance({ status: 'analyzing', message: 'Analyzing…', progress: 0 })
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [state])

  const cardStyle = {
    background: 'rgba(15,16,17,0.92)',
    border: '1px solid #23252a',
    backdropFilter: 'blur(10px)',
  }

  if (state === 'active') {
    const isReady = guidance.status === 'ready'
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-[500px] shrink-0 rounded-[10px] overflow-hidden flex flex-col"
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
          <canvas ref={analysisCanvasRef} className="hidden" aria-hidden="true" />

          {/* Guidance pill */}
          <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
            <motion.div
              key={guidance.status}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="px-2.5 py-1 rounded-[6px] text-[11px] font-medium"
              style={{
                background: 'rgba(15,16,17,0.85)',
                border: '1px solid #23252a',
                color: GUIDANCE_COLOR[guidance.status],
              }}
              role="status"
              aria-live="polite"
            >
              {guidance.message}
            </motion.div>
          </div>

          {/* Progress bar — fills while stable; green = good to capture */}
          {isReady && (
            <div
              className="absolute inset-x-0 bottom-0 h-[2px]"
              style={{ background: '#1a2a1e' }}
            >
              <div
                className="h-full"
                style={{
                  width: `${guidance.progress}%`,
                  background: '#27a644',
                  transition: 'width 100ms linear',
                }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-2 pt-2">
          <span className="text-[10px] text-[#62666d] w-16 shrink-0">Brightness</span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.05"
            value={brightness}
            onChange={(e) => setBrightness(parseFloat(e.target.value))}
            aria-label="Brightness adjustment"
            className="flex-1 accent-[#5e6ad2] h-1 cursor-pointer"
          />
          <span className="text-[10px] text-[#8a8f98] w-8 text-right tabular-nums">
            {Math.round(brightness * 100)}%
          </span>
        </div>

        <div className="flex gap-1.5 p-2 pt-1.5">
          <button
            onClick={captureFrame}
            disabled={isProcessing}
            aria-label="Capture frame"
            className="flex-1 text-[11px] font-medium rounded-[6px] py-2 transition-all disabled:opacity-40"
            style={{
              background: isReady ? '#1a3a1e' : '#5e6ad2',
              border: isReady ? '1px solid #27a644' : '1px solid transparent',
              color: isReady ? '#27a644' : '#ffffff',
            }}
            onMouseEnter={(e) => {
              if (!isReady) e.currentTarget.style.background = '#828fff'
            }}
            onMouseLeave={(e) => {
              if (!isReady) e.currentTarget.style.background = '#5e6ad2'
            }}
          >
            {isProcessing ? 'Processing…' : 'Capture'}
          </button>
          <button
            onClick={() => {
              stopStream()
              setCameraState('idle')
            }}
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
      className="w-[500px] shrink-0 rounded-[10px] p-[14px] flex flex-col gap-[9px]"
      style={cardStyle}
    >
      <div
        className="rounded-[7px] px-3 py-10 min-h-[180px] flex flex-col items-center justify-center text-center border border-dashed border-[#34343a]"
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
