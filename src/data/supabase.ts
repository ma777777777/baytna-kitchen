import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, Row } from './repo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Demo mode whenever the backend isn't configured. */
export const cloudEnabled = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null

const COLUMNS = 'collection,key,data,deleted,updated_at,updated_by'

export function cloudBackend(client: SupabaseClient, householdId: string): Backend {
  return {
    async pull(since) {
      const out: Row[] = []
      let cursor = since
      // page through in server order; >= so rows sharing a timestamp aren't skipped (merge is idempotent)
      for (let page = 0; page < 50; page++) {
        let q = client.from('household_rows').select(COLUMNS).eq('household_id', householdId).order('updated_at').limit(1000)
        if (cursor) q = q.gte('updated_at', cursor)
        const { data, error } = await q
        if (error) throw error
        const rows = (data ?? []) as Row[]
        out.push(...rows)
        if (rows.length < 1000) break
        const last = rows[rows.length - 1].updated_at
        if (last === cursor) break
        cursor = last
      }
      return out
    },
    async push(rows) {
      const payload = rows.map((r) => ({
        household_id: householdId,
        collection: r.collection,
        key: r.key,
        data: r.data,
        deleted: r.deleted,
      }))
      const { error } = await client.from('household_rows').upsert(payload, { onConflict: 'household_id,collection,key' })
      if (error) throw error
    },
    subscribe(onRows, onStatus) {
      const channel = client
        .channel(`household:${householdId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'household_rows', filter: `household_id=eq.${householdId}` },
          (payload) => {
            const r = payload.new as Row & { household_id: string }
            if (r && r.collection) onRows([r])
          },
        )
        .subscribe((status) => onStatus(status === 'SUBSCRIBED'))
      return () => {
        void client.removeChannel(channel)
      }
    },
  }
}

// ---------- household membership ----------

export interface HouseholdInfo {
  id: string
  name: string
  members: { id: string; name: string }[]
}

export async function loadHousehold(client: SupabaseClient, userId: string): Promise<HouseholdInfo | null> {
  const { data: mine, error } = await client.from('household_members').select('household_id').eq('user_id', userId).limit(1)
  if (error) throw error
  const hid = mine?.[0]?.household_id as string | undefined
  if (!hid) return null
  const [{ data: h, error: e1 }, { data: members, error: e2 }] = await Promise.all([
    client.from('households').select('id,name').eq('id', hid).single(),
    client.from('household_members').select('user_id, profiles(display_name)').eq('household_id', hid),
  ])
  if (e1 || e2) throw e1 ?? e2
  return {
    id: hid,
    name: (h?.name as string) ?? '',
    members: (members ?? []).map((m: { user_id: string; profiles: unknown }) => {
      const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { display_name?: string } | null
      return { id: m.user_id, name: p?.display_name || '' }
    }),
  }
}

export async function saveProfileName(client: SupabaseClient, userId: string, name: string) {
  const { error } = await client.from('profiles').upsert({ id: userId, display_name: name.trim() })
  if (error) throw error
}

export async function createHousehold(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.rpc('create_household', { p_name: name })
  if (error) throw error
  return data as string
}

export async function createInvite(client: SupabaseClient, householdId: string): Promise<string> {
  const { data, error } = await client.rpc('create_invite', { p_household: householdId })
  if (error) throw error
  return data as string
}

export async function joinHousehold(client: SupabaseClient, code: string): Promise<string> {
  const { data, error } = await client.rpc('join_household', { p_code: code.trim().toUpperCase() })
  if (error) throw error
  return data as string
}
