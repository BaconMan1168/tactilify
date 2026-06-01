'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImageUploader } from '@/components/input/ImageUploader'
import { CameraCapture } from '@/components/input/CameraCapture'
import type { UploadedImage } from '@/types/diagram'

export default function HomePage() {
  const [image, setImage] = useState<UploadedImage | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-[var(--color-hairline)] bg-[var(--color-canvas)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center gap-3">
          <svg
            aria-hidden="true"
            className="h-5 w-5 text-[var(--color-primary)] shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 5.323V3a1 1 0 011-1z" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight text-[var(--color-ink)]">
            Tactilify
          </span>
          <span className="hidden sm:block text-[12px] text-[var(--color-ink-tertiary)] border-l border-[var(--color-hairline)] pl-3 ml-1">
            STEM Diagram Accessibility
          </span>
        </div>
      </header>

      <main
        id="main-content"
        className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-10"
      >
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            Make any STEM diagram accessible
          </h1>
          <p className="mt-2 text-[14px] text-[var(--color-ink-subtle)] max-w-xl">
            Upload or photograph a circuit diagram, graph, or free-body diagram.
            Tactilify generates audio walkthroughs, high-contrast SVGs, and tactile prints.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section aria-label="Diagram input">
            <Tabs defaultValue="upload">
              <TabsList
                className="mb-4 bg-[var(--color-surface-1)] border border-[var(--color-hairline)] rounded-md p-1 h-auto"
                aria-label="Input method"
              >
                <TabsTrigger
                  value="upload"
                  className="text-[13px] data-[state=active]:bg-[var(--color-surface-3)] data-[state=active]:text-[var(--color-ink)] text-[var(--color-ink-subtle)] rounded-sm px-4 py-1.5"
                >
                  Upload file
                </TabsTrigger>
                <TabsTrigger
                  value="camera"
                  className="text-[13px] data-[state=active]:bg-[var(--color-surface-3)] data-[state=active]:text-[var(--color-ink)] text-[var(--color-ink-subtle)] rounded-sm px-4 py-1.5"
                >
                  Camera
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload">
                <ImageUploader
                  onUpload={setImage}
                  isProcessing={isProcessing}
                  onProcessingChange={setIsProcessing}
                />
              </TabsContent>

              <TabsContent value="camera">
                <CameraCapture
                  onCapture={setImage}
                  isProcessing={isProcessing}
                  onProcessingChange={setIsProcessing}
                />
              </TabsContent>
            </Tabs>
          </section>

          <section aria-label="Image preview" aria-live="polite">
            <AnimatePresence mode="wait">
              {image ? (
                <motion.div
                  key={image.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-1)] overflow-hidden"
                >
                  <div className="border-b border-[var(--color-hairline)] px-4 py-3 flex items-center justify-between">
                    <p className="text-[13px] font-medium text-[var(--color-ink)]">Preview</p>
                    <button
                      onClick={() => setImage(null)}
                      aria-label="Remove image"
                      className="text-[var(--color-ink-tertiary)] hover:text-[var(--color-ink)] transition-colors p-1 rounded focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus)]"
                    >
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <path d="M3 3l10 10M13 3L3 13" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:${image.mimeType};base64,${image.base64}`}
                      alt="Uploaded diagram preview"
                      className="w-full rounded object-contain max-h-[400px]"
                    />
                  </div>
                  <div className="border-t border-[var(--color-hairline)] px-4 py-3">
                    <p className="font-mono text-[11px] text-[var(--color-ink-tertiary)]">
                      id: {image.id} &middot; {image.mimeType}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-hairline)] bg-[var(--color-surface-1)] px-6 py-10 text-center"
                  aria-label="No image uploaded yet"
                >
                  <p className="text-[14px] text-[var(--color-ink-subtle)]">
                    Your preprocessed diagram will appear here
                  </p>
                  <p className="text-[12px] text-[var(--color-ink-tertiary)]">
                    Upload or capture a diagram to continue
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>
    </div>
  )
}
