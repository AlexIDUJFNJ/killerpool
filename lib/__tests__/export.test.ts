/**
 * Tests for the screenshot export
 *
 * The renderer itself needs a real browser (jsdom has no canvas), so these
 * check the wiring: that the export goes through html2canvas-pro — the fork
 * that parses the oklch()/oklab() colours Tailwind 4 emits — and that its
 * canvas ends up as a PNG download.
 */

jest.mock('html2canvas-pro', () => ({
  __esModule: true,
  default: jest.fn(),
}))

import html2canvas from 'html2canvas-pro'
import { exportScreenshot } from '../export'

const render = html2canvas as unknown as jest.Mock
const png = new Blob(['png'], { type: 'image/png' })

let clicked: HTMLAnchorElement[]

beforeEach(() => {
  render.mockReset()
  render.mockResolvedValue({
    toBlob: (callback: (blob: Blob | null) => void) => callback(png),
  })
  clicked = []
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    clicked.push(this)
  })
  // jsdom implements neither
  URL.createObjectURL = jest.fn(() => 'blob:screenshot')
  URL.revokeObjectURL = jest.fn()
  document.body.innerHTML = '<div id="game-details-content"></div>'
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('exportScreenshot', () => {
  it('renders the element with html2canvas-pro and downloads it as a PNG', async () => {
    await exportScreenshot('game-details-content', 'killerpool-game-abc.png')

    expect(render).toHaveBeenCalledWith(
      document.getElementById('game-details-content'),
      expect.objectContaining({ backgroundColor: '#000000', scale: 2 })
    )
    expect(URL.createObjectURL).toHaveBeenCalledWith(png)
    expect(clicked).toHaveLength(1)
    expect(clicked[0].getAttribute('href')).toBe('blob:screenshot')
    expect(clicked[0].getAttribute('download')).toBe('killerpool-game-abc.png')
    // The temporary link does not stay in the page
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('falls back to the whole page when the element is missing', async () => {
    await exportScreenshot('no-such-element')

    expect(render).toHaveBeenCalledWith(document.body, expect.anything())
    expect(clicked[0].getAttribute('download')).toMatch(/^killerpool-screenshot-\d+\.png$/)
  })

  it('rethrows a rendering failure for the caller to report', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    render.mockRejectedValue(new Error('Attempting to parse an unsupported color function'))

    await expect(exportScreenshot('game-details-content')).rejects.toThrow(
      'unsupported color function'
    )
    expect(clicked).toHaveLength(0)
  })
})
