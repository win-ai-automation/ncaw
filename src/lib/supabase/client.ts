'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { publicSupabaseEnv } from './env'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  const env = publicSupabaseEnv()
  client ??= createBrowserClient<Database>(env.url, env.publishableKey)
  return client
}

