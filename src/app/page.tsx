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
          className="flex-1 flex flex-col justify-center max-w-3xl"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <p
            className="font-semibold text-[#5e6ad2] mb-5"
            style={{ fontSize: '26px', letterSpacing: '-0.5px' }}
          >
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
            Upload or photograph a STEM diagram. Get audio, high-contrast, tactile, and navigable outputs.
          </p>
        </motion.div>

        {/* Bottom-right: input card anchored, preview floats above it */}
        <motion.div
          className="flex items-end justify-end"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
          aria-label="Diagram input"
        >
          {/* Relative anchor — preview floats above this, input card sits inside */}
          <div className="relative">
            {/* Preview card — absolutely above the input card, doesn't shift layout */}
            <AnimatePresence>
              {image && (
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
                        <p className="text-[12px] text-[#f7f8f8] truncate">diagram.{image.mimeType.split('/')[1]}</p>
                        <p className="text-[10px] text-[#62666d] mt-0.5 font-mono">{image.id.slice(0, 8)}</p>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => setImage(null)}
                          aria-label="Remove image"
                          className="flex-1 text-[12px] text-[#8a8f98] bg-[#18191a] border border-[#23252a] rounded-[6px] py-1.5 hover:text-[#f7f8f8] transition-colors"
                        >
                          Remove
                        </button>
                        <button
                          aria-label="Confirm and analyze diagram"
                          className="flex-1 text-[12px] text-white rounded-[6px] py-1.5 font-medium hover:bg-[#828fff] transition-colors"
                          style={{ background: '#5e6ad2' }}
                          onClick={() => { /* Phase 2 */ }}
                        >
                          Analyze
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
      </main>
    </div>
  )
}
