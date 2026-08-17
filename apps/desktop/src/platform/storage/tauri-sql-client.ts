import Database from '@tauri-apps/plugin-sql'
import type { SqlClient, SqlExecutor, SqlValue } from './sql-client'

class TauriSqlExecutor implements SqlExecutor {
  constructor(private readonly db: Database) {}

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<void> {
    await this.db.execute(sql, [...params])
  }

  async first<T>(sql: string, params: readonly SqlValue[] = []): Promise<T | null> {
    const rows = await this.all<T>(sql, params)
    return rows[0] ?? null
  }

  async all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    return this.db.select<T[]>(sql, [...params])
  }

  async scalar<T>(sql: string, params: readonly SqlValue[] = []): Promise<T> {
    const row = await this.first<Record<string, T>>(sql, params)
    if (!row) throw new Error(`Scalar query returned no rows: ${sql}`)
    return Object.values(row)[0] as T
  }
}

export async function createTauriSqlClient(): Promise<SqlClient> {
  const db = await Database.load('sqlite:lumaroute.db')
  const executor = new TauriSqlExecutor(db)

  return {
    execute: (sql, params) => executor.execute(sql, params),
    first: (sql, params) => executor.first(sql, params),
    all: (sql, params) => executor.all(sql, params),
    scalar: (sql, params) => executor.scalar(sql, params),
    async migrate(): Promise<void> {
      // Migrations run via tauri-plugin-sql on Database.load.
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      await executor.execute('BEGIN IMMEDIATE')
      try {
        const result = await fn(executor)
        await executor.execute('COMMIT')
        return result
      } catch (error) {
        await executor.execute('ROLLBACK')
        throw error
      }
    },
    dump() {
      throw new Error('dump() is only available on the in-memory SQL client')
    },
  }
}
