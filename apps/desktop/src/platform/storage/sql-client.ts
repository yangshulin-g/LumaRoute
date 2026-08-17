export type SqlValue = string | number | boolean | null

export interface SqlExecutor {
  execute(sql: string, params?: readonly SqlValue[]): Promise<void>
  first<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>
  scalar<T>(sql: string, params?: readonly SqlValue[]): Promise<T>
}

export interface SqlClient extends SqlExecutor {
  migrate(): Promise<void>
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
  dump(): MemorySqlDump
}

export interface MemorySqlDump {
  userVersion: number
  server_profiles: readonly Record<string, SqlValue>[]
  server_lines: readonly Record<string, SqlValue>[]
  preferences: readonly Record<string, SqlValue>[]
}

type ProfileRow = {
  id: string
  name: string
  kind: string
  server_id: string
  user_id: string
  username: string
  credential_key: string
  preferred_line_id: string
  sort_order: number
}

type LineRow = {
  id: string
  profile_id: string
  label: string
  base_url: string
  priority: number
  enabled: number
}

type PreferenceRow = {
  key: string
  value_json: string
}

class MemoryDatabase {
  userVersion = 0
  serverProfiles = new Map<string, ProfileRow>()
  serverLines = new Map<string, LineRow>()
  preferences = new Map<string, PreferenceRow>()

  migrate(): void {
    // Mirrors 0001_init.sql CREATE TABLE IF NOT EXISTS semantics.
    this.userVersion = 1
  }

  dump(): MemorySqlDump {
    return {
      userVersion: this.userVersion,
      server_profiles: [...this.serverProfiles.values()].map((row) => ({ ...row })),
      server_lines: [...this.serverLines.values()].map((row) => ({ ...row })),
      preferences: [...this.preferences.values()].map((row) => ({ ...row })),
    }
  }

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<void> {
    const normalized = normalizeSql(sql)

    if (normalized.startsWith('insert into server_profiles')) {
      const [
        id,
        name,
        kind,
        serverId,
        userId,
        username,
        credentialKey,
        preferredLineId,
        sortOrder,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        number,
      ]
      const existing = this.serverProfiles.get(id)
      this.serverProfiles.set(id, {
        id,
        name,
        kind,
        server_id: serverId,
        user_id: userId,
        username,
        credential_key: credentialKey,
        preferred_line_id: preferredLineId,
        sort_order:
          existing && normalized.includes('on conflict') ? existing.sort_order : Number(sortOrder),
      })
      return
    }

    if (normalized.startsWith('delete from server_lines where profile_id = ?')) {
      const profileId = String(params[0])
      for (const [id, row] of this.serverLines) {
        if (row.profile_id === profileId) this.serverLines.delete(id)
      }
      return
    }

    if (normalized.startsWith('insert into server_lines')) {
      const [id, profileId, label, baseUrl, priority, enabled] = params as [
        string,
        string,
        string,
        string,
        number,
        number,
      ]
      this.serverLines.set(id, {
        id,
        profile_id: profileId,
        label,
        base_url: baseUrl,
        priority: Number(priority),
        enabled: Number(enabled),
      })
      return
    }

    if (normalized.startsWith('delete from server_profiles where id = ?')) {
      const profileId = String(params[0])
      this.serverProfiles.delete(profileId)
      for (const [id, row] of this.serverLines) {
        if (row.profile_id === profileId) this.serverLines.delete(id)
      }
      return
    }

    if (normalized.startsWith('update server_profiles set sort_order = ? where id = ?')) {
      const [sortOrder, profileId] = params as [number, string]
      const row = this.serverProfiles.get(profileId)
      if (row) row.sort_order = Number(sortOrder)
      return
    }

    if (normalized.startsWith('insert into preferences')) {
      const [valueJson] = params as [string]
      this.preferences.set('app', { key: 'app', value_json: valueJson })
      return
    }

    throw new Error(`Unsupported SQL execute: ${sql}`)
  }

  async first<T>(sql: string, params: readonly SqlValue[] = []): Promise<T | null> {
    const rows = await this.all<T>(sql, params)
    return rows[0] ?? null
  }

  async all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    const normalized = normalizeSql(sql)

    if (normalized.startsWith('select * from server_profiles where id = ?')) {
      const row = this.serverProfiles.get(String(params[0]))
      return row ? ([row] as T[]) : []
    }

    if (
      normalized.startsWith(
        'select * from server_lines where profile_id = ? order by priority, id',
      )
    ) {
      const profileId = String(params[0])
      return [...this.serverLines.values()]
        .filter((row) => row.profile_id === profileId)
        .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)) as T[]
    }

    if (normalized.startsWith('select id from server_profiles order by sort_order, id')) {
      return [...this.serverProfiles.values()]
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        .map((row) => ({ id: row.id })) as T[]
    }

    if (normalized.startsWith("select value_json from preferences where key = 'app'")) {
      const row = this.preferences.get('app')
      return row ? ([row] as T[]) : []
    }

    throw new Error(`Unsupported SQL all: ${sql}`)
  }

  async scalar<T>(sql: string, params: readonly SqlValue[] = []): Promise<T> {
    const normalized = normalizeSql(sql)
    if (
      normalized.startsWith(
        'select coalesce(max(sort_order) + 1, 0) from server_profiles where id <> ?',
      )
    ) {
      const excludeId = String(params[0])
      let max = -1
      for (const row of this.serverProfiles.values()) {
        if (row.id !== excludeId) max = Math.max(max, row.sort_order)
      }
      return (max + 1) as T
    }
    throw new Error(`Unsupported SQL scalar: ${sql}`)
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function createMemorySqlClient(): SqlClient {
  const db = new MemoryDatabase()
  const executor: SqlExecutor = {
    execute: (sql, params) => db.execute(sql, params),
    first: (sql, params) => db.first(sql, params),
    all: (sql, params) => db.all(sql, params),
    scalar: (sql, params) => db.scalar(sql, params),
  }

  return {
    ...executor,
    async migrate(): Promise<void> {
      db.migrate()
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const snapshot = {
        userVersion: db.userVersion,
        serverProfiles: new Map(
          [...db.serverProfiles.entries()].map(([id, row]) => [id, { ...row }]),
        ),
        serverLines: new Map([...db.serverLines.entries()].map(([id, row]) => [id, { ...row }])),
        preferences: new Map([...db.preferences.entries()].map(([key, row]) => [key, { ...row }])),
      }
      try {
        return await fn(executor)
      } catch (error) {
        db.userVersion = snapshot.userVersion
        db.serverProfiles = snapshot.serverProfiles
        db.serverLines = snapshot.serverLines
        db.preferences = snapshot.preferences
        throw error
      }
    },
    dump: () => db.dump(),
  }
}
