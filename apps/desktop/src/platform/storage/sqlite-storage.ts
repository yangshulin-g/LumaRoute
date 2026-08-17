import type { AppPreferences, ServerLine, ServerProfile, StoragePort } from '@lumaroute/core'
import type { SqlClient } from './sql-client'

const DEFAULT_PREFERENCES: AppPreferences = {
  deviceId: null,
  activeServerId: null,
  activeLibraryIdByServer: {},
  sensitiveLineIds: [],
}

export class SqliteStorage implements StoragePort {
  constructor(private readonly db: SqlClient) {}

  async initialize(): Promise<void> {
    await this.db.migrate()
  }

  async saveServerProfile(profile: ServerProfile): Promise<void> {
    await this.db.transaction(async (tx) => {
      const sortOrder = await tx.scalar<number>(
        'SELECT COALESCE(MAX(sort_order) + 1, 0) FROM server_profiles WHERE id <> ?',
        [profile.id],
      )
      await tx.execute(
        `INSERT INTO server_profiles
          (id,name,kind,server_id,user_id,username,credential_key,preferred_line_id,sort_order)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,kind=excluded.kind,server_id=excluded.server_id,
          user_id=excluded.user_id,username=excluded.username,
          credential_key=excluded.credential_key,preferred_line_id=excluded.preferred_line_id`,
        [
          profile.id,
          profile.name,
          profile.kind,
          profile.serverId,
          profile.userId,
          profile.username,
          profile.credentialKey,
          profile.preferredLineId,
          sortOrder,
        ],
      )
      await tx.execute('DELETE FROM server_lines WHERE profile_id = ?', [profile.id])
      for (const line of profile.lines) {
        await tx.execute(
          `INSERT INTO server_lines
            (id,profile_id,label,base_url,priority,enabled) VALUES (?,?,?,?,?,?)`,
          [line.id, profile.id, line.label, line.baseUrl, line.priority, line.enabled ? 1 : 0],
        )
      }
    })
  }

  async getServerProfile(profileId: string): Promise<ServerProfile | null> {
    const profile = await this.db.first<Record<string, unknown>>(
      'SELECT * FROM server_profiles WHERE id = ?',
      [profileId],
    )
    if (!profile) return null
    const lines = await this.db.all<Record<string, unknown>>(
      'SELECT * FROM server_lines WHERE profile_id = ? ORDER BY priority, id',
      [profileId],
    )
    return this.mapProfile(profile, lines)
  }

  async listServerProfiles(): Promise<readonly ServerProfile[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      'SELECT id FROM server_profiles ORDER BY sort_order, id',
    )
    return (
      await Promise.all(rows.map((row) => this.getServerProfile(String(row.id))))
    ).filter((profile): profile is ServerProfile => profile !== null)
  }

  async deleteServerProfile(profileId: string): Promise<void> {
    await this.db.execute('DELETE FROM server_profiles WHERE id = ?', [profileId])
  }

  async reorderServerProfiles(profileIds: readonly string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [sortOrder, profileId] of profileIds.entries()) {
        await tx.execute('UPDATE server_profiles SET sort_order = ? WHERE id = ?', [
          sortOrder,
          profileId,
        ])
      }
    })
  }

  async loadPreferences(): Promise<AppPreferences> {
    const row = await this.db.first<{ value_json: string }>(
      "SELECT value_json FROM preferences WHERE key = 'app'",
    )
    return row ? (JSON.parse(row.value_json) as AppPreferences) : DEFAULT_PREFERENCES
  }

  async savePreferences(preferences: AppPreferences): Promise<void> {
    await this.db.execute(
      `INSERT INTO preferences(key,value_json) VALUES('app',?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,
      [JSON.stringify(preferences)],
    )
  }

  private mapProfile(
    row: Record<string, unknown>,
    lineRows: Record<string, unknown>[],
  ): ServerProfile {
    const lines: ServerLine[] = lineRows.map((line) => ({
      id: String(line.id),
      label: String(line.label),
      baseUrl: String(line.base_url),
      priority: Number(line.priority),
      enabled: Number(line.enabled) === 1,
    }))
    return {
      id: String(row.id),
      name: String(row.name),
      kind: row.kind as ServerProfile['kind'],
      serverId: String(row.server_id),
      userId: String(row.user_id),
      username: String(row.username),
      credentialKey: String(row.credential_key),
      preferredLineId: String(row.preferred_line_id),
      lines,
    }
  }
}
