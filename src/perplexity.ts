import type { ExpiringContract } from "./contracts.js"

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"

interface PerplexityMessage {
  role: "system" | "user" | "assistant"
  content: string
}

function getApiKey(): string {
  const key = process.env.PERPLEXITY_API_KEY
  if (!key) throw new Error("Missing PERPLEXITY_API_KEY environment variable")
  return key
}

async function chatCompletion(messages: PerplexityMessage[]): Promise<string> {
  const res = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Perplexity API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

export interface ExposedCompany {
  company: string
  reason: string
  people: ContactPerson[]
}

export interface ContactPerson {
  name: string
  title: string
  linkedin_url: string
}

export interface OutreachReport {
  contract: ExpiringContract
  analysis: string
  companies: ExposedCompany[]
}

/**
 * For a batch of expiring contracts, ask Perplexity to identify
 * exposed companies and key people to reach out to.
 */
export async function researchExposedCompanies(
  contracts: ExpiringContract[]
): Promise<OutreachReport[]> {
  const reports: OutreachReport[] = []

  for (const contract of contracts) {
    console.log(`  Researching: ${contract.market_title} (${(contract.probability * 100).toFixed(1)}%)...`)

    const systemPrompt = `You are a research analyst helping a prediction market trading firm identify companies that would be most affected by certain events. You return structured JSON only, no markdown.`

    const userPrompt = `A prediction market contract is about to expire:

Title: "${contract.market_title}"
Event: "${contract.event_title}"
Current probability: ${(contract.probability * 100).toFixed(1)}%
Expiry: ${contract.expiry_date}
Platform: ${contract.platform}

This contract has a low probability (<25%), meaning the market thinks this event is unlikely to happen. However, if it DID happen, some companies would be significantly affected.

Research and identify 3-5 publicly traded companies or major private companies that would be MOST exposed (positively or negatively) if this event occurred. For each company, find 1-2 senior people (VP+, C-suite, Head of relevant department) who would be the right person to discuss hedging or risk management related to this event.

Return ONLY valid JSON in this exact format:
{
  "analysis": "Brief 2-3 sentence analysis of the risk landscape",
  "companies": [
    {
      "company": "Company Name (TICKER)",
      "reason": "Why they are exposed to this event",
      "people": [
        {
          "name": "Full Name",
          "title": "Their job title",
          "linkedin_url": "https://linkedin.com/in/their-profile or 'unknown'"
        }
      ]
    }
  ]
}`

    try {
      const raw = await chatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ])

      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
      const parsed = JSON.parse(cleaned)

      reports.push({
        contract,
        analysis: parsed.analysis ?? "",
        companies: (parsed.companies ?? []).map((c: any) => ({
          company: c.company ?? "Unknown",
          reason: c.reason ?? "",
          people: (c.people ?? []).map((p: any) => ({
            name: p.name ?? "Unknown",
            title: p.title ?? "",
            linkedin_url: p.linkedin_url ?? "unknown",
          })),
        })),
      })
    } catch (err) {
      console.error(`  Failed to research "${contract.market_title}":`, err)
      reports.push({
        contract,
        analysis: "Research failed",
        companies: [],
      })
    }
  }

  return reports
}
