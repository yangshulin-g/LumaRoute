import { describe, expect, it } from 'vitest'
import { mediaKindLabel, progressPercent } from './media-presenters'

describe('media presenters', () => {
  it('clamps a real playback position to a display percentage', () => {
    expect(progressPercent({ playbackPositionSeconds: 90, runtimeSeconds: 120 })).toBe(75)
    expect(progressPercent({ playbackPositionSeconds: 150, runtimeSeconds: 120 })).toBe(100)
  })

  it('omits progress when runtime is unavailable or invalid', () => {
    expect(progressPercent({ playbackPositionSeconds: 20, runtimeSeconds: null })).toBeNull()
    expect(progressPercent({ playbackPositionSeconds: 20, runtimeSeconds: 0 })).toBeNull()
  })

  it('labels every media kind in Chinese', () => {
    expect(mediaKindLabel('movie')).toBe('电影')
    expect(mediaKindLabel('series')).toBe('剧集')
    expect(mediaKindLabel('season')).toBe('季')
    expect(mediaKindLabel('episode')).toBe('单集')
  })
})
