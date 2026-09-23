import { describe, expect, test, vi } from 'vitest'
import { COMPACT_BUILD, FULL_BUILD, createProgressAggregator } from './browser'
import type { DownloadProgress } from './browser'

const MB = 1024 * 1024

describe('createProgressAggregator', () => {
  test('reports progress across a single file', () => {
    const seen: DownloadProgress[] = []
    const report = createProgressAggregator((p) => seen.push(p))
    report({ file: 'model.onnx', loaded: 50 * MB, total: 100 * MB })
    expect(seen.at(-1)?.fraction).toBeCloseTo(0.5)
  })

  test('totals several files into one figure', () => {
    const seen: DownloadProgress[] = []
    const report = createProgressAggregator((p) => seen.push(p))
    report({ file: 'a.onnx', loaded: 0, total: 100 * MB })
    report({ file: 'b.json', loaded: 0, total: 100 * MB })
    report({ file: 'a.onnx', loaded: 100 * MB, total: 100 * MB })
    expect(seen.at(-1)?.fraction).toBeCloseTo(0.5)
  })

  test('reports megabytes a person can read', () => {
    const seen: DownloadProgress[] = []
    const report = createProgressAggregator((p) => seen.push(p))
    report({ file: 'model.onnx', loaded: 155 * MB, total: 310 * MB })
    expect(seen.at(-1)).toMatchObject({
      megabytesDone: 155,
      megabytesTotal: 310,
    })
  })

  test('never reports more than complete', () => {
    const seen: DownloadProgress[] = []
    const report = createProgressAggregator((p) => seen.push(p))
    report({ file: 'model.onnx', loaded: 120 * MB, total: 100 * MB })
    expect(seen.at(-1)?.fraction).toBe(1)
  })

  test('ignores a report with nothing to measure', () => {
    const onProgress = vi.fn()
    const report = createProgressAggregator(onProgress)
    report({ status: 'initiate' })
    expect(onProgress).not.toHaveBeenCalled()
  })
})

describe('model builds', () => {
  test('the full build is the one that needs WebGPU', () => {
    expect(FULL_BUILD).toMatchObject({ dtype: 'fp32', device: 'webgpu' })
  })

  test('the compact build runs without WebGPU', () => {
    expect(COMPACT_BUILD.device).toBe('wasm')
  })

  test('the compact build is the smaller download', () => {
    expect(COMPACT_BUILD.megabytes).toBeLessThan(FULL_BUILD.megabytes)
  })
})
