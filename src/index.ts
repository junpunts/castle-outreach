import dotenv from "dotenv"
dotenv.config({ path: [".env.local", ".env"] })

import { findExpiringLowProbContracts } from "./contracts.js"
import { researchExposedCompanies, type OutreachReport } from "./perplexity.js"
import { sendOutreachEmail } from "./email.js"
import { writeFileSync, mkdirSync } from "fs"
import { resolve } from "path"

function formatReport(reports: OutreachReport[]): string {
  const lines: string[] = []
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  lines.push(`CASTLE OUTREACH REPORT — ${date}`)
  lines.push("=".repeat(60))
  lines.push("")

  for (const report of reports) {
    const c = report.contract
    lines.push(`CONTRACT: ${c.market_title}`)
    lines.push(`  Event:       ${c.event_title}`)
    lines.push(`  Probability: ${(c.probability * 100).toFixed(1)}%`)
    lines.push(`  Expires:     ${c.expiry_date}`)
    lines.push(`  Volume:      $${c.volume.toLocaleString()}`)
    lines.push(`  Platform:    ${c.platform}`)
    lines.push(`  URL:         ${c.url}`)
    lines.push("")
    lines.push(`  ANALYSIS: ${report.analysis}`)
    lines.push("")

    if (report.companies.length === 0) {
      lines.push("  No companies identified.")
    }

    for (const company of report.companies) {
      lines.push(`  COMPANY: ${company.company}`)
      lines.push(`    Exposure: ${company.reason}`)
      for (const person of company.people) {
        lines.push(`    → ${person.name} — ${person.title}`)
        if (person.linkedin_url !== "unknown") {
          lines.push(`      LinkedIn: ${person.linkedin_url}`)
        }
      }
      lines.push("")
    }

    lines.push("-".repeat(60))
    lines.push("")
  }

  // Summary table — deduplicated by person+company
  lines.push("OUTREACH SUMMARY")
  lines.push("=".repeat(60))

  interface ContactEntry {
    name: string
    title: string
    company: string
    contracts: string[]
    linkedin: string
  }

  const contactMap = new Map<string, ContactEntry>()
  for (const r of reports) {
    for (const co of r.companies) {
      for (const p of co.people) {
        // Skip placeholder entries
        if (p.name === "Unknown" || p.name.startsWith("Managing Partner of") || p.name.startsWith("Practice Group")) continue

        const key = `${p.name}|||${co.company}`
        const existing = contactMap.get(key)
        if (existing) {
          if (!existing.contracts.includes(r.contract.market_title)) {
            existing.contracts.push(r.contract.market_title)
          }
          // Keep the better LinkedIn URL
          if (existing.linkedin === "unknown" && p.linkedin_url !== "unknown") {
            existing.linkedin = p.linkedin_url
          }
        } else {
          contactMap.set(key, {
            name: p.name,
            title: p.title,
            company: co.company,
            contracts: [r.contract.market_title],
            linkedin: p.linkedin_url,
          })
        }
      }
    }
  }

  const uniqueContacts = [...contactMap.values()]
  const uniqueCompanies = new Set(uniqueContacts.map((c) => c.company))

  lines.push(`Total contracts analyzed: ${reports.length}`)
  lines.push(`Unique companies identified: ${uniqueCompanies.size}`)
  lines.push(`Unique contacts to reach out to: ${uniqueContacts.length}`)
  lines.push("")
  lines.push("⚠  LinkedIn URLs are AI-generated and should be verified before use.")
  lines.push("")

  for (const contact of uniqueContacts) {
    lines.push(`• ${contact.name} (${contact.title}) @ ${contact.company}`)
    for (const ct of contact.contracts) {
      lines.push(`  Re: ${ct}`)
    }
    if (contact.linkedin !== "unknown") {
      lines.push(`  LinkedIn: ${contact.linkedin}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

async function main() {
  console.log("Castle Outreach — Finding expiring low-probability contracts...\n")

  const contracts = await findExpiringLowProbContracts(10)

  if (contracts.length === 0) {
    console.log("No contracts found matching criteria. Exiting.")
    return
  }

  console.log(`Found ${contracts.length} contracts:\n`)
  for (const c of contracts) {
    console.log(`  • ${c.market_title} — ${(c.probability * 100).toFixed(1)}% — expires ${c.expiry_date}`)
  }
  console.log("")

  console.log("Researching exposed companies via Perplexity...\n")
  const reports = await researchExposedCompanies(contracts)

  const text = formatReport(reports)
  console.log("\n" + text)

  // Write reports to files
  const dateStr = new Date().toISOString().split("T")[0]
  const textPath = resolve(`reports/outreach-${dateStr}.txt`)
  const jsonPath = resolve(`reports/outreach-${dateStr}.json`)

  const jsonStr = JSON.stringify(reports, null, 2)

  mkdirSync(resolve("reports"), { recursive: true })
  writeFileSync(textPath, text)
  writeFileSync(jsonPath, jsonStr)

  console.log(`\nReports saved to:`)
  console.log(`  ${textPath}`)
  console.log(`  ${jsonPath}`)

  // Send email if configured
  if (process.env.RESEND_API_KEY && process.env.EMAIL_TO) {
    console.log("\nSending outreach email...")
    await sendOutreachEmail(text, jsonStr)
  } else {
    console.log("\nSkipping email (RESEND_API_KEY or EMAIL_TO not set)")
  }
}

main().catch((err) => {
  console.error("Outreach pipeline failed:", err)
  process.exit(1)
})
