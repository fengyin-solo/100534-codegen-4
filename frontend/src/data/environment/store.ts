import { SEED_ENVIRONMENT } from './seed'
import type { EnvironmentDb } from './types'

// 环境册单独存一把钥匙，与通用登记台的数据互不干扰。
const STORAGE_KEY = 'storeroom-environment:ledger:v1'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): EnvironmentDb {
  const fallback = clone(SEED_ENVIRONMENT)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Partial<EnvironmentDb>
    // 老版本缓存缺字段时用种子补齐，避免升级后读不出来。
    return {
      points: parsed.points ?? fallback.points,
      readings: parsed.readings ?? fallback.readings,
      disposals: parsed.disposals ?? fallback.disposals,
      todos: parsed.todos ?? fallback.todos,
      seq: { ...fallback.seq, ...(parsed.seq ?? {}) },
    }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: EnvironmentDb | null = null

export function envDb(): EnvironmentDb {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function saveEnvDb(db: EnvironmentDb): void {
  cache = db
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  }
}

export function resetEnvDb(): EnvironmentDb {
  const fresh = clone(SEED_ENVIRONMENT)
  saveEnvDb(fresh)
  return fresh
}

export function envStorageKey(): string {
  return STORAGE_KEY
}
