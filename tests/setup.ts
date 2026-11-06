import 'fake-indexeddb/auto'

// jsdom 未启用时提供最小 DOM 能力，供 Blob / URL 相关代码使用
if (!(globalThis as any).Blob) {
  const { Blob } = require('node:buffer')
  ;(globalThis as any).Blob = Blob
}
