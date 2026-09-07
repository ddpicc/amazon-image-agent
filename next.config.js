const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['*.openai.com', '*.amazon.com', 'images.unsplash.com'],
  },
  webpack: (config) => {
    // The background-removal tool runs in the browser. Force Transformers.js
    // to use its web build so Next does not bundle ONNX native `.node` files.
    config.resolve.alias['@huggingface/transformers$'] = path.join(__dirname, 'node_modules/@huggingface/transformers/dist/transformers.web.js')
    config.module.rules.push({
      test: /ort\.webgpu\.bundle\.min\.mjs$/,
      type: 'javascript/esm',
    })
    return config
  },
}

module.exports = nextConfig
