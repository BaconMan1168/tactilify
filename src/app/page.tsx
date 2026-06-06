'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { CircuitBackground } from '@/components/ui/CircuitBackground'
import { ImageUploader } from '@/components/input/ImageUploader'
import { CameraCapture } from '@/components/input/CameraCapture'
import { AudioPlayer } from '@/components/output/AudioPlayer'
import { TactileSVG } from '@/components/output/TactileSVG'
import { DiagramMap } from '@/components/output/DiagramMap'
import { HighContrastImage } from '@/components/output/HighContrastImage'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { UploadedImage, DiagramAnalysis } from '@/types/diagram'

const OUTPUT_TABS = [
  { id: 'audio', label: 'Audio walkthrough' },
  { id: 'tactile', label: 'Tactile / braille' },
  { id: 'diagram-map', label: 'Diagram map' },
  { id: 'high-contrast', label: 'Hi-contrast' },
] as const

type AppState = 'idle' | 'preview' | 'processing' | 'results'
type InputMode = 'upload' | 'camera'

const STEP_THRESHOLDS = [18, 48, 76, 100]
const STEP_LABELS = [
  'Classifying diagram type',
  'Extracting objects & relationships',
  'Generating narration',
  'Building accessible outputs',
]

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [inputMode, setInputMode] = useState<InputMode>('upload')
  const [image, setImage] = useState<UploadedImage | null>(null)
  const [analysis, setAnalysis] = useState<DiagramAnalysis | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [debugOpen, setDebugOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('audio')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const apiResolved = useRef(false)

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  useEffect(() => () => stopTimer(), [])

  const startProgress = () => {
    setProgress(0)
    apiResolved.current = false
    timerRef.current = setInterval(() => {
      setProgress(prev => {
        const target = apiResolved.current ? 100 : 90
        const step = prev < 50 ? 1.8 : prev < 75 ? 0.9 : 0.3
        return Math.min(target, prev + step * (Math.random() + 0.5))
      })
    }, 120)
  }

  const handleImage = (img: UploadedImage) => {
    setImage(img)
    setAnalysis(null)
    setAppState('preview')
    setInputMode('upload')
  }

  const handleAnalyze = useCallback(async () => {
    if (!image) return
    setAppState('processing')
    startProgress()

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: image.base64, mimeType: image.mimeType }),
      })
      const data = (await res.json()) as DiagramAnalysis & { error?: string }
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`)

      apiResolved.current = true
      stopTimer()
      setProgress(100)

      setTimeout(() => {
        setAnalysis(data)
        setAppState('results')
      }, 600)
    } catch (err) {
      stopTimer()
      setAppState('preview')
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message, { action: { label: 'Retry', onClick: handleAnalyze } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image])

  const handleReset = () => {
    setAppState('idle')
    setImage(null)
    setAnalysis(null)
    setProgress(0)
  }

  const activeStep = STEP_THRESHOLDS.findIndex(t => progress < t)

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#010102]">
      <CircuitBackground pulse={appState === 'processing'} />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#5e6ad2] focus:text-white focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      <AnimatePresence mode="wait">

        {/* ── PROCESSING ── */}
        {appState === 'processing' && (
          <motion.main
            key="processing"
            id="main-content"
            className="relative z-10 flex flex-col min-h-screen px-8 sm:px-10 pt-10 pb-7"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="flex-1 flex flex-col justify-center max-w-xl"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="font-medium text-[#8a8f98] mb-5 uppercase tracking-widest" style={{ fontSize: '11px' }}>
                Tactilify
              </p>
              <h1
                className="font-semibold text-[#d0d6e0]"
                style={{ fontSize: 'clamp(40px, 7vw, 64px)', letterSpacing: '-2.5px', lineHeight: 1.05 }}
              >
                Analyzing<br />your diagram
              </h1>
              <p className="text-[15px] text-[#62666d] mt-5">
                Claude Vision is reading the image...
              </p>
            </motion.div>

            <motion.div
              className="flex items-end justify-end"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            >
              <div
                className="w-full max-w-[520px] rounded-[12px] p-6"
                style={{ background: 'rgba(15,16,17,0.92)', border: '1px solid #34343a', backdropFilter: 'blur(10px)' }}
              >
                {/* Scan wrap */}
                <div
                  className="h-[140px] rounded-lg mb-5 relative overflow-hidden"
                  style={{ background: 'linear-gradient(135deg,#1a1d28,#0f1016)' }}
                >
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:${image.mimeType};base64,${image.base64}`}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover opacity-40"
                    />
                  )}
                  <div
                    className="scan-line absolute left-0 right-0 h-[2px]"
                    style={{
                      background: 'linear-gradient(to right, transparent, #5e6ad2 30%, #828fff 50%, #5e6ad2 70%, transparent)',
                      boxShadow: '0 0 10px #5e6ad2',
                    }}
                  />
                </div>

                {/* Progress bar */}
                <div className="flex justify-between mb-2">
                  <span className="text-[15px] text-[#8a8f98]">Processing</span>
                  <span className="text-[15px] font-semibold text-[#5e6ad2]">{Math.round(progress)}%</span>
                </div>
                <div className="h-[8px] bg-[#23252a] rounded-full overflow-hidden mb-5">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${progress}%`,
                      background: 'linear-gradient(to right,#5e6ad2,#828fff)',
                      transition: 'width 0.25s ease',
                    }}
                  />
                </div>

                {/* Steps */}
                <div className="flex flex-col gap-3">
                  {STEP_LABELS.map((label, i) => {
                    const done = progress >= STEP_THRESHOLDS[i]
                    const active = !done && i === activeStep
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div
                          className={`w-[10px] h-[10px] rounded-full flex-shrink-0 ${active ? 'dot-pulse' : ''}`}
                          style={{ background: done ? '#27a644' : active ? '#5e6ad2' : '#23252a' }}
                        />
                        <span className="text-[15px]" style={{ color: done ? '#27a644' : active ? '#f7f8f8' : '#3e3e44' }}>
                          {label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </motion.main>
        )}

        {/* ── RESULTS ── */}
        {appState === 'results' && analysis && (
          <motion.div
            key="results"
            className="relative z-10 flex flex-col min-h-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            {/* Nav bar */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #23252a' }}>
              <span className="text-[18px] font-semibold" style={{ letterSpacing: '-0.3px' }}>Tactilify</span>
              <div className="flex items-center gap-2">
                <div className="w-[10px] h-[10px] rounded-full bg-[#27a644]" />
                <span className="text-[14px] text-[#27a644]">Analysis complete</span>
              </div>
              <button
                onClick={handleReset}
                className="text-[14px] text-[#8a8f98] bg-[#0f1011] border border-[#23252a] rounded-[6px] px-4 py-2 hover:border-[#5e6ad2] hover:text-[#f7f8f8] transition-colors"
              >
                New diagram
              </button>
            </div>

            {/* Body */}
            <div id="main-content" className="flex flex-1 overflow-hidden">
              {/* Left — diagram */}
              <div className="flex flex-col gap-4 p-6" style={{ width: '44%', borderRight: '1px solid #23252a' }}>
                <span className="text-[13px] font-medium text-[#62666d] uppercase tracking-[0.4px]">Your diagram</span>
                <motion.div
                  className="flex-1 rounded-lg overflow-hidden border min-h-0"
                  style={{ background: 'linear-gradient(135deg,#1a1d28,#0f1016)', borderColor: '#23252a' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                >
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:${image.mimeType};base64,${image.base64}`}
                      alt="Uploaded diagram"
                      className="w-full h-full object-contain"
                    />
                  )}
                </motion.div>
                <div>
                  <p className="text-[15px] text-[#d0d6e0]">diagram.{image?.mimeType.split('/')[1]}</p>
                  <p className="text-[13px] text-[#62666d] mt-1">
                    {analysis.layoutHint} · {analysis.elements.length} component{analysis.elements.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Right — outputs */}
              <div className="flex-1 flex flex-col relative overflow-hidden">
                {/* Foggy glass background — blurred circuit lines as a static texture */}
                <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                  <div style={{ position: 'absolute', inset: 0, filter: 'blur(28px)', opacity: 0.85 }}>
                    <svg
                      viewBox="0 0 600 500"
                      xmlns="http://www.w3.org/2000/svg"
                      preserveAspectRatio="xMidYMid slice"
                      style={{ width: '100%', height: '100%' }}
                    >
                      <path d="M0 110 H90 V60 H230 V110 H330 V80 H600" fill="none" stroke="#5e6ad2" strokeWidth="3" />
                      <path d="M230 110 V200 H110 V300 H280 V250 H390 V330 H600" fill="none" stroke="#828fff" strokeWidth="2" />
                      <path d="M110 300 V400 H270 V490" fill="none" stroke="#3a3f6b" strokeWidth="2.5" />
                      <circle cx="90"  cy="110" r="7" fill="#5e6ad2" />
                      <circle cx="230" cy="110" r="7" fill="#828fff" />
                      <circle cx="330" cy="80"  r="7" fill="#5e6ad2" />
                      <circle cx="110" cy="300" r="7" fill="#828fff" />
                      <circle cx="280" cy="250" r="7" fill="#5e6ad2" />
                      <circle cx="270" cy="490" r="7" fill="#828fff" />
                    </svg>
                  </div>
                  {/* Dark fog layer — lets the blurred glow show through while keeping text readable */}
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,3,8,0.58)' }} />
                </div>

                {/* Content */}
                <div className="relative z-10 p-6 flex flex-col gap-4 overflow-y-auto flex-1">
                  <span className="text-[13px] font-medium text-[#62666d] uppercase tracking-[0.4px]">
                    Accessible outputs
                  </span>

                  <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
                    {/* Tab bar */}
                    <TabsList
                      className="w-full h-auto gap-0.5 rounded-[8px] p-[4px]"
                      style={{ background: '#0f1011', border: '1px solid #23252a' }}
                    >
                      {OUTPUT_TABS.map((tab) => (
                        <TabsTrigger
                          key={tab.id}
                          value={tab.id}
                          className="relative flex-1 h-auto rounded-[6px] !bg-transparent !shadow-none"
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            padding: '6px 14px',
                            color: activeTab === tab.id ? '#f7f8f8' : '#62666d',
                            cursor: 'pointer',
                          }}
                        >
                          {activeTab === tab.id && (
                            <motion.div
                              layoutId="tab-indicator"
                              className="absolute inset-0 rounded-[6px]"
                              style={{ background: '#18191a' }}
                              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                            />
                          )}
                          <span className="relative z-10">{tab.label}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {/* Audio walkthrough */}
                    <TabsContent value="audio">
                      <AudioPlayer steps={analysis.narration} />
                    </TabsContent>

                    {/* Tactile / braille SVG — Phase 4.5 */}
                    <TabsContent value="tactile">
                      <TactileSVG
                        analysis={analysis}
                        imageBase64={image?.base64}
                        imageMimeType={image?.mimeType}
                      />
                    </TabsContent>

                    {/* Diagram map — Phase 5 */}
                    <TabsContent value="diagram-map">
                      <DiagramMap analysis={analysis} />
                    </TabsContent>

                    {/* High-contrast image — Phase 6 */}
                    <TabsContent value="high-contrast">
                      {image && (
                        <HighContrastImage
                          analysis={analysis}
                          imageBase64={image.base64}
                          imageMimeType={image.mimeType}
                        />
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── LANDING (idle + preview) ── */}
        {(appState === 'idle' || appState === 'preview') && (
          <motion.main
            key="landing"
            id="main-content"
            className="relative z-10 flex flex-col min-h-screen px-8 sm:px-10 pt-10 pb-7"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Hero */}
            <motion.div
              className="flex-1 flex flex-col justify-center max-w-3xl"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="font-semibold text-[#5e6ad2] mb-5" style={{ fontSize: '26px', letterSpacing: '-0.5px' }}>
                Tactilify
              </p>
              <h1
                className="font-semibold text-[#f7f8f8]"
                style={{ fontSize: 'clamp(56px, 9vw, 88px)', letterSpacing: '-3.5px', lineHeight: 1.05 }}
              >
                Make any<br />diagram<br />accessible
              </h1>
              <p
                className="text-[17px] text-[#8a8f98] mt-7 max-w-[480px] leading-relaxed"
                style={{ letterSpacing: '-0.1px' }}
              >
                Upload or photograph a STEM diagram. Get audio narration, tactile braille, and a navigable diagram map.
              </p>
            </motion.div>

            {/* Input — bottom right */}
            <motion.div
              className="flex items-end justify-end"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
              aria-label="Diagram input"
            >
              <div className="relative">
                {/* Preview card floats above */}
                <AnimatePresence>
                  {appState === 'preview' && image && (
                    <motion.div
                      key={image.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute bottom-full right-0 mb-3 w-[500px] rounded-[10px]"
                      style={{
                        background: 'rgba(15,16,17,0.92)',
                        border: '1px solid #23252a',
                        backdropFilter: 'blur(10px)',
                      }}
                      aria-label="Diagram preview"
                      aria-live="polite"
                    >
                      <div className="flex gap-3 p-3">
                        <div
                          className="flex-shrink-0 w-[100px] h-[80px] rounded-md overflow-hidden"
                          style={{ background: 'linear-gradient(135deg,#1a1d28,#0f1016)' }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`data:${image.mimeType};base64,${image.base64}`}
                            alt="Uploaded diagram"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex flex-col justify-between flex-1 min-w-0">
                          <div>
                            <p className="text-[12px] text-[#f7f8f8] truncate">
                              diagram.{image.mimeType.split('/')[1]}
                            </p>
                            <p className="text-[10px] text-[#62666d] mt-0.5 font-mono">{image.id.slice(0, 8)}</p>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => { setImage(null); setAppState('idle') }}
                              aria-label="Remove image"
                              className="flex-1 text-[12px] text-[#8a8f98] bg-[#18191a] border border-[#23252a] rounded-[6px] py-1.5 hover:text-[#f7f8f8] transition-colors"
                            >
                              Remove
                            </button>
                            <button
                              onClick={handleAnalyze}
                              aria-label="Analyze diagram"
                              className="flex-1 text-[12px] text-white rounded-[6px] py-1.5 font-medium hover:bg-[#828fff] transition-colors"
                              style={{ background: '#5e6ad2' }}
                            >
                              Analyze
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Upload / camera toggle */}
                <AnimatePresence mode="wait">
                  {inputMode === 'camera' ? (
                    <motion.div
                      key="camera"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                      <CameraCapture
                        onCapture={handleImage}
                        isProcessing={isProcessing}
                        onProcessingChange={setIsProcessing}
                        onBack={() => setInputMode('upload')}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="upload"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                      <ImageUploader
                        onUpload={handleImage}
                        isProcessing={isProcessing}
                        onProcessingChange={setIsProcessing}
                        onCameraRequest={() => setInputMode('camera')}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.main>
        )}

      </AnimatePresence>

      {/* Dev-only debug panel */}
      {process.env.NODE_ENV === 'development' && analysis && appState === 'results' && (
        <div
          className="fixed bottom-4 left-4 z-50 w-[420px] max-h-[400px] rounded-[10px] overflow-hidden"
          style={{ background: 'rgba(10,11,13,0.96)', border: '1px solid #23252a', backdropFilter: 'blur(12px)' }}
        >
          <button
            onClick={() => setDebugOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-mono text-[#62666d] hover:text-[#8a8f98] transition-colors"
            aria-expanded={debugOpen}
          >
            <span>DiagramAnalysis — {analysis.layoutHint} — {analysis.elements.length} elements</span>
            <span>{debugOpen ? '▼' : '▶'}</span>
          </button>
          <AnimatePresence>
            {debugOpen && (
              <motion.pre
                key="debug"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-auto text-[10px] font-mono text-[#8a8f98] px-4 pb-4"
                style={{ maxHeight: '320px' }}
              >
                {JSON.stringify(analysis, null, 2)}
              </motion.pre>
            )}
          </AnimatePresence>
        </div>
      )}

      <style>{`
        .scan-line { animation: scanDown 2s ease-in-out infinite; }
        .dot-pulse  { animation: dotPulse 0.9s ease-in-out infinite alternate; }
        @keyframes scanDown {
          0%   { top: -2px; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes dotPulse {
          0%   { transform: scale(1); }
          100% { transform: scale(1.6); }
        }
      `}</style>
    </div>
  )
}
