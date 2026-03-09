import dotenv from "dotenv"
dotenv.config({ path: [".env.local", ".env"] })

import { findExpiringLowProbContracts } from "./contracts.js"

async function main() {
  const contracts = await findExpiringLowProbContracts(10)
  console.log(`\nSelected ${contracts.length} contracts:\n`)
  for (const c of contracts) {
    console.log(`  • ${c.market_title}`)
    console.log(`    Prob: ${(c.probability * 100).toFixed(1)}% | Vol: $${c.volume?.toLocaleString()} | Expires: ${c.expiry_date}`)
    console.log(`    Event: ${c.event_title} (${c.platform})`)
    console.log()
  }
}

main()
