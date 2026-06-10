import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'sharp', '@u4/opencv4nodejs'],
}

export default nextConfig
