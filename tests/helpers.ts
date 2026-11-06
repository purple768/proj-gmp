import { createDb, type GmpDB } from '@/core/db'
import { useDb } from '@/core/db/repo'

let seq = 0

/** 每个用例一个独立库，避免互相污染 */
export async function freshDb(label = 'test'): Promise<GmpDB> {
  seq += 1
  const db = createDb(`GMP_TEST_${label}_${Date.now()}_${seq}`)
  useDb(db)
  await db.open()
  return db
}

export function makeFile(content: string, name = 'file.txt'): File {
  return new File([content], name, { type: 'text/plain' })
}
