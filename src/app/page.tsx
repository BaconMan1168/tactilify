'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CircuitBackground } from '@/components/ui/CircuitBackground'
import { ImageUploader } from '@/components/input/ImageUploader'
import { CameraCapture } from '@/components/input/CameraCapture'
import type { UploadedImage } from '@/types/diagram'

type InputMode = 'upload' | 'camera'

export default function HomePage() {
  const [image, setImage] = useState<UploadedImage | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [inputMode, setInputMode] = useState<InputMode>('upload')

  const handleImage = (img: UploadedImage) => {
    setImage(img)
    setInputMode('upload')
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#010102]">
      {/* Animated circuit background */}
      <CircuitBackground pulse={isProcessing} />

      {/* Skip nav */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#5e6ad2] focus:text-white focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Main layout — grid rows: hero (flex-1) / card row (auto) */}
      <main
        id="main-content"
        className="relative z-10 flex flex-col min-h-screen px-8 sm:px-10 pt-10 pb-7"
        style={{ gridTemplateRows: '1fr auto' }}
      >
        {/* Hero text — top left, vertically centred in the flex-1 space */}
        <motion.div
          className="flex-1 flex flex-col justify-center max-w-lg"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-[11px] font-medium tracking-[1.2px] uppercase text-[#5e6ad2] mb-3.5">
            Tactilify
          </p>
          <h1
            className="font-semibold text-[#f7f8f8] leading-[0.95]"
            style={{ fontSize: 'clamp(36px, 7vw, 56px)', letterSpacing: '-2.5px' }}
          >
            Make any<br />diagram<br />accessible
          </h1>
          <p className="text-[15px] text-[#8a8f98] mt-4 max-w-[340px] leading-relaxed" style={{ letterSpacing: '-0.1px' }}>
            Upload or photograph a STEM diagram. Get audio, high-contrast, tactile, and navigable outputs.
          </p>
        </motion.div>

        {/* Bottom-right: upload card + preview card */}
        <motion.div
          className="flex items-end justify-end gap-3"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
          aria-label="Diagram input"
        >
          <AnimatePresence mode="wait">
            {inputMode === 'camera' ? (
              <motion.div
                key="camera"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="w-[300px]"
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

          {/* Preview card — slides in when image is ready */}
          <AnimatePresence>
            {image && (
              <motion.div
                key={image.id}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 160, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden shrink-0 flex flex-col rounded-[10px]"
                style={{
                  background: 'rgba(15,16,17,0.92)',
                  border: '1px solid #23252a',
                  backdropFilter: 'blur(10px)',
                }}
                aria-label="Diagram preview"
                aria-live="polite"
              >
                {/* Thumbnail */}
                <div
                  className="flex items-center justify-center mx-2 mt-2 rounded-md overflow-hidden"
                  style={{ minHeight: 80, background: 'linear-gradient(135deg,#1a1d28,#0f1016)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:${image.mimeType};base64,${image.base64}`}
                    alt="Uploaded diagram"
                    className="w-full h-full object-cover"
                    style={{ maxHeight: 90 }}
                  />
                </div>

                {/* Meta */}
                <div className="px-2 py-[7px] flex-1">
                  <p className="text-[10px] text-[#f7f8f8] truncate">diagram.{image.mimeType.split('/')[1]}</p>
                  <p className="text-[9px] text-[#62666d] mt-0.5 font-mono">{image.id.slice(0, 8)}</p>
                </div>

                {/* Confirm / dismiss */}
                <div className="px-2 pb-2 flex gap-1.5">
                  <button
                    onClick={() => setImage(null)}
                    aria-label="Remove image"
                    className="flex-1 text-[10px] text-[#8a8f98] bg-[#18191a] border border-[#23252a] rounded-[6px] py-1.5 hover:text-[#f7f8f8] transition-colors"
                  >
                    Remove
                  </button>
                  <button
                    aria-label="Confirm and analyze diagram"
                    className="flex-1 text-[10px] text-white rounded-[6px] py-1.5 font-medium hover:bg-[#828fff] transition-colors whitespace-nowrap"
                    style={{ background: '#5e6ad2' }}
                    onClick={() => {
                      /* Phase 2 will trigger analysis here */
                    }}
                  >
                    Analyze
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  )
}
