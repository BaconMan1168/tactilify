import sharp from 'sharp'

const HC_NORMALISE_LOWER = 1
const HC_NORMALISE_UPPER = 99
const HC_CLAHE_WIDTH = 8
const HC_CLAHE_HEIGHT = 8
const HC_CLAHE_MAX_SLOPE = 4
const HC_SHARPEN_SIGMA = 1.2
const HC_SHARPEN_M1 = 0.5
const HC_SHARPEN_M2 = 2.5
const HC_SATURATION = 1.5

export async function processHighContrast(imageBase64: string): Promise<string> {
  const inputBuffer = Buffer.from(imageBase64, 'base64')

  const outputBuffer = await sharp(inputBuffer)
    .normalise({ lower: HC_NORMALISE_LOWER, upper: HC_NORMALISE_UPPER })
    .clahe({ width: HC_CLAHE_WIDTH, height: HC_CLAHE_HEIGHT, maxSlope: HC_CLAHE_MAX_SLOPE })
    .sharpen({ sigma: HC_SHARPEN_SIGMA, m1: HC_SHARPEN_M1, m2: HC_SHARPEN_M2 })
    .modulate({ saturation: HC_SATURATION })
    .png()
    .toBuffer()

  return outputBuffer.toString('base64')
}
