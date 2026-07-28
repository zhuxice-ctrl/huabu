import Database from '@tauri-apps/plugin-sql'

// Keep the database handle in a leaf module so database initializers can be
// statically imported without forming an index -> initializer -> index cycle.
// Kept non-null at the type boundary for the legacy vector module. Startup
// configures and opens this handle before that module is dynamically imported.
export let db: Database = null!

let databasePromise: Promise<Database> | null = null
let databaseUrl = 'sqlite:note.db'

export function configureDatabasePath(databasePath: string): void {
  const nextUrl = `sqlite:${databasePath}`
  if ((db || databasePromise) && nextUrl !== databaseUrl) {
    throw new Error('Database path must be configured before SQLite is opened.')
  }
  databaseUrl = nextUrl
}

export function getConfiguredDatabaseUrl(): string {
  return databaseUrl
}

// Compatibility boundary for existing database modules.
export async function getDb() {
  if (!databasePromise) {
    databasePromise = Database.load(databaseUrl)
      .then(handle => {
        db = handle
        return handle
      })
      .catch(error => {
        databasePromise = null
        throw error
      })
  }
  return databasePromise
}
