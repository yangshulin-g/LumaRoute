import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { usePlayerStore } from '../../stores/player-store'

const CLOSE_FLUSH_TIMEOUT_MS = 2_000

type PlayerStore = ReturnType<typeof usePlayerStore>

export async function registerCloseHandler(playerStore: PlayerStore): Promise<() => void> {
  let closing = false
  return listen('app-close-requested', async () => {
    if (closing) return
    closing = true
    try {
      await Promise.race([
        playerStore.shutdown(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('shutdown timed out')), CLOSE_FLUSH_TIMEOUT_MS)
        }),
      ])
    } catch (error) {
      console.warn('Final playback report timed out or failed', {
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
    await getCurrentWindow().destroy()
  })
}
