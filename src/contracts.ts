import { getSupabase } from "./supabase.js"

export interface ExpiringContract {
  market_id: string
  market_title: string
  probability: number
  volume: number
  expiry_date: string
  event_id: string
  event_title: string
  platform: string
  category: string | null
  url: string
}

// Skip contracts that are clearly noise / not actionable for outreach
const NOISE_PATTERNS = [
  /tweets?/i,
  /# of posts/i,
  /followers/i,
  /subscriber/i,
]

function isNoise(title: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(title))
}

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Finds contracts expiring within the next 30 days with probability < 25%.
 * - Filters out noise contracts
 * - Deduplicates by event (picks one market per event)
 * - Randomly samples `limit` contracts from the pool
 */
export async function findExpiringLowProbContracts(
  limit = 10
): Promise<ExpiringContract[]> {
  const now = new Date()
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const supabase = getSupabase()

  // Fetch the full qualifying pool
  const { data: markets, error } = await supabase
    .from("scraped_markets")
    .select("id, event_id, title, probability, volume, expiry_date")
    .lt("probability", 0.25)
    .gt("probability", 0)
    .gte("expiry_date", now.toISOString())
    .lte("expiry_date", thirtyDaysOut.toISOString())
    .limit(1000)

  if (error) {
    throw new Error(`Failed to query scraped_markets: ${error.message}`)
  }

  if (!markets || markets.length === 0) {
    console.log("No contracts matching criteria found.")
    return []
  }

  // Filter noise
  const filtered = markets.filter((m) => !isNoise(m.title))

  // Deduplicate by event_id — pick one market per event (first seen after shuffle)
  const shuffled = shuffle(filtered)
  const seenEvents = new Set<string>()
  const deduped: typeof filtered = []
  for (const m of shuffled) {
    if (seenEvents.has(m.event_id)) continue
    seenEvents.add(m.event_id)
    deduped.push(m)
  }

  // Randomly pick `limit` from the deduped pool
  const selected = shuffle(deduped).slice(0, limit)

  console.log(`  (Pool: ${markets.length} markets → ${filtered.length} after noise filter → ${deduped.length} unique events → picked ${selected.length})`)

  // Fetch parent events for context
  const eventIds = [...new Set(selected.map((m) => m.event_id))]
  const { data: events, error: eventsError } = await getSupabase()
    .from("scraped_events")
    .select("id, title, platform, category, url")
    .in("id", eventIds)

  if (eventsError) {
    throw new Error(`Failed to query scraped_events: ${eventsError.message}`)
  }

  const eventMap = new Map(events?.map((e) => [e.id, e]) ?? [])

  return selected.map((m) => {
    const event = eventMap.get(m.event_id)
    return {
      market_id: m.id,
      market_title: m.title,
      probability: m.probability,
      volume: m.volume,
      expiry_date: m.expiry_date,
      event_id: m.event_id,
      event_title: event?.title ?? "Unknown",
      platform: event?.platform ?? "unknown",
      category: event?.category ?? null,
      url: event?.url ?? "",
    }
  })
}
