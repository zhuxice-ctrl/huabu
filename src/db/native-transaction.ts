import { invoke } from '@tauri-apps/api/core'

import { getConfiguredDatabaseUrl } from './client.ts'
import type { SqlExecutor } from './workspace-recovery'

export interface NativeSqliteStatement {
  query: string
  bindValues?: unknown[]
  minRowsAffected?: number
}

export function createStatementRecorder(): SqlExecutor & { statements: NativeSqliteStatement[] } {
  const statements: NativeSqliteStatement[] = []
  return {
    statements,
    async execute(query, bindValues = []) {
      statements.push({ query, bindValues })
      return { rowsAffected: 0 }
    },
    async select() {
      throw new Error('Statement recorder cannot execute selects.')
    },
  }
}

export async function executeNativeSqliteTransaction(statements: NativeSqliteStatement[]) {
  if (statements.length === 0) return []
  return invoke<number[]>('execute_sqlite_transaction', {
    databaseUrl: getConfiguredDatabaseUrl(),
    statements,
  })
}
