/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['*'] }
  },
  webpack: (config) => {
    // ✅ どの環境でも @ が /src を指すように固定
    config.resolve.alias['@'] = path.resolve(__dirname, 'src')
    return config
  }
}
module.exports = nextConfig
