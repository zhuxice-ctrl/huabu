import Database from '@tauri-apps/plugin-sql'

// Keep the database handle in a leaf module so database initializers can be
// statically imported without forming an index -> initializer -> index cycle.
export const db = await Database.load('sqlite:note.db')

// Compatibility boundary for existing database modules.
export async function getDb() {
  return db
}
