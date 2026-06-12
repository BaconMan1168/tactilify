import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { nanoid } from 'nanoid'
import { fileTypeFromBuffer } from 'file-type'
import type { SupportedMimeType } from '@/types/diagram'
import { normalizeImage } from '@/lib/imageNormalize'

const ALLOWED_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

const MAX_DIMENSION = 1024

async function pdfToImageBuffer(pdfBuffer: Buffer): Promise<Buffer> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { getDocument, GlobalWorkerOptions } = (pdfjsLib as any).default ?? pdfjsLib

  GlobalWorkerOptions.workerSrc = ''

  const { createCanvas } = await import('@napi-rs/canvas')

  const loadingTask = getDocument({ data: new Uint8Array(pdfBuffer) })
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(1)

  const scale = 2
  const viewport = page.getViewport({ scale })
  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
  const context = canvas.getContext('2d')

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise

  return canvas.toBuffer('image/png') as Buffer
}

export async function POST(req: NextRequest) {
  const rawBrightness = parseFloat(new URL(req.url).searchParams.get('brightness') ?? '1')
  const brightness = isNaN(rawBrightness) ? 1 : Math.max(0.5, Math.min(2, rawBrightness))

  let fileBuffer: Buffer

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    fileBuffer = Buffer.from(arrayBuffer)
  } catch {
    return NextResponse.json({ error: 'Failed to read upload' }, { status: 400 })
  }

  const detected = await fileTypeFromBuffer(fileBuffer)
  const originalMime = detected?.mime ?? ''

  if (!ALLOWED_TYPES.has(originalMime)) {
    return NextResponse.json(
      { error: `Unsupported file type. Please upload a JPEG, PNG, WebP, or PDF.` },
      { status: 415 },
    )
  }

  let imageBuffer: Buffer
  let outputMime: SupportedMimeType

  if (originalMime === 'application/pdf') {
    try {
      imageBuffer = await pdfToImageBuffer(fileBuffer)
      outputMime = 'image/png'
    } catch {
      return NextResponse.json(
        { error: 'Failed to convert PDF to image.' },
        { status: 422 },
      )
    }
  } else {
    imageBuffer = fileBuffer
    outputMime = originalMime as SupportedMimeType
  }

  imageBuffer = normalizeImage(imageBuffer)

  const sharpFormat = outputMime === 'image/png' ? 'png' : 'jpeg'
  outputMime = sharpFormat === 'png' ? 'image/png' : 'image/jpeg'

  let processedBuffer: Buffer
  try {
    let pipeline = sharp(imageBuffer).resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    if (brightness !== 1) pipeline = pipeline.modulate({ brightness })
    processedBuffer = await pipeline.toFormat(sharpFormat, { quality: 92 }).toBuffer()
  } catch {
    return NextResponse.json(
      { error: 'Failed to process image.' },
      { status: 422 },
    )
  }

  const base64 = processedBuffer.toString('base64')
  const id = nanoid()

  return NextResponse.json({ id, base64, mimeType: outputMime })
}
