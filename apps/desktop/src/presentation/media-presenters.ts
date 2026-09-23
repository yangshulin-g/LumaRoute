import type { MediaItem, MediaKind } from '@lumaroute/core'
import type { PlaybackPlan } from '@lumaroute/player'

export function mediaKindLabel(kind: MediaKind): string {
  return { movie: '电影', series: '剧集', season: '季', episode: '单集' }[kind]
}

export function progressPercent(
  item: Pick<MediaItem, 'playbackPositionSeconds' | 'runtimeSeconds'>,
): number | null {
  if (item.runtimeSeconds == null || item.runtimeSeconds <= 0) return null
  return Math.min(
    100,
    Math.max(0, Math.round((item.playbackPositionSeconds / item.runtimeSeconds) * 100)),
  )
}

export function playbackPlanFacts(plan: PlaybackPlan): readonly string[] {
  const facts = [plan.method === 'direct-play' ? '原文件直放' : '直接串流']
  for (const value of [plan.container, plan.videoCodec, plan.audioCodec]) {
    if (value?.trim()) facts.push(value.trim().toUpperCase())
  }
  if (plan.bitrate != null) facts.push(`${(plan.bitrate / 1_000_000).toFixed(1)} Mbps`)
  return facts
}

const COLLECTION_TYPE_LABELS: Readonly<Record<string, string>> = {
  movies: '电影',
  tvshows: '剧集',
  music: '音乐',
  boxsets: '合集',
  homevideos: '家庭视频',
  musicvideos: 'MV',
  mixed: '混合',
}

export function collectionTypeLabel(type: string | null): string {
  if (type == null) return '媒体库'
  return COLLECTION_TYPE_LABELS[type.toLowerCase()] ?? type
}
