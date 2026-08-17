import type { StoragePort } from '@lumaroute/core'

export class DeviceIdentity {
  constructor(private readonly storage: StoragePort) {}

  async getOrCreate(): Promise<string> {
    const preferences = await this.storage.loadPreferences()
    if (preferences.deviceId) return preferences.deviceId
    const deviceId = crypto.randomUUID()
    await this.storage.savePreferences({ ...preferences, deviceId })
    return deviceId
  }
}
