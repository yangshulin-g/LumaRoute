import { describe, expect, it } from 'vitest'
import {
  collectionTypeLabel,
  mediaKindLabel,
  playbackPlanFacts,
  progressPercent,
} from './media-presenters'

describe('media presenters', () => {
  it('formats only facts present in a playback plan', () => {
    expect(
      playbackPlanFacts({
        itemId: 'item-1',
        mediaSourceId: 'source-1',
        playSessionId: 'session-1',
        streamUrl: 'https://media.example/stream',
        requestHeaders: {},
        container: 'mkv',
        videoCodec: 'hevc',
        audioCodec: 'aac',
        bitrate: 8_000_000,
        durationSeconds: 120,
        method: 'direct-play',
        startPositionSeconds: 0,
      }),
    ).toEqual(['原文件直放', 'MKV', 'HEVC', 'AAC', '8.0 Mbps'])
  })

  it('omits empty codec and container strings from playback facts', () => {
    expect(
      playbackPlanFacts({
        itemId: 'item-1',
        mediaSourceId: 'source-1',
        playSessionId: 'session-1',
        streamUrl: 'https://media.example/stream',
        requestHeaders: {},
        container: '',
        videoCodec: '',
        audioCodec: '',
        bitrate: null,
        durationSeconds: 120,
        method: 'direct-stream',
        startPositionSeconds: 0,
      }),
    ).toEqual(['直接串流'])
  })

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

  it('labels common Emby/Jellyfin collection types in Chinese', () => {
    expect(collectionTypeLabel('movies')).toBe('电影')
    expect(collectionTypeLabel('tvshows')).toBe('剧集')
    expect(collectionTypeLabel('music')).toBe('音乐')
    expect(collectionTypeLabel('boxsets')).toBe('合集')
    expect(collectionTypeLabel('homevideos')).toBe('家庭视频')
    expect(collectionTypeLabel('musicvideos')).toBe('MV')
    expect(collectionTypeLabel('mixed')).toBe('混合')
  })

  it('shows unknown collection types as-is and null as a generic library', () => {
    expect(collectionTypeLabel('podcasts')).toBe('podcasts')
    expect(collectionTypeLabel(null)).toBe('媒体库')
  })
})
