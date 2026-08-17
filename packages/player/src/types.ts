export type PlaybackMethod = 'direct-play' | 'direct-stream'

export interface PlaybackPlan {
  itemId: string
  mediaSourceId: string
  playSessionId: string
  streamUrl: string
  requestHeaders: Readonly<Record<string, string>>
  container: string
  videoCodec: string
  audioCodec: string | null
  bitrate: number | null
  durationSeconds: number
  method: PlaybackMethod
  startPositionSeconds: number
}

export type PlayerEvent =
  | { type: 'started'; positionSeconds: number; durationSeconds: number }
  | { type: 'position'; positionSeconds: number; durationSeconds: number }
  | { type: 'paused'; positionSeconds: number; durationSeconds: number }
  | { type: 'resumed'; positionSeconds: number; durationSeconds: number }
  | { type: 'seeked'; positionSeconds: number; durationSeconds: number }
  | { type: 'ended'; positionSeconds: number; durationSeconds: number }
  | { type: 'stopped'; positionSeconds: number; durationSeconds: number }
  | { type: 'error'; code: 'PlayerUnavailable' | 'PlaybackFailed'; message: string }

export type Unsubscribe = () => void
