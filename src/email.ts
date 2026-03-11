import { Resend } from "resend"

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error("Missing RESEND_API_KEY environment variable")
  return new Resend(key)
}

function getRecipients(): string[] {
  const raw = process.env.EMAIL_TO
  if (!raw) throw new Error("Missing EMAIL_TO environment variable")
  return raw.split(",").map((e) => e.trim())
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? "Castle Outreach <outreach@castle.com>"
}

export async function sendOutreachEmail(textReport: string, jsonReport: string) {
  const resend = getResend()
  const to = getRecipients()
  const from = getFromAddress()

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: `Castle Outreach Report — ${dateStr}`,
    text: textReport,
    attachments: [
      {
        filename: `outreach-${new Date().toISOString().split("T")[0]}.json`,
        content: Buffer.from(jsonReport).toString("base64"),
        contentType: "application/json",
      },
    ],
  })

  if (error) {
    throw new Error(`Resend error: ${error.message}`)
  }

  console.log(`Email sent to ${to.join(", ")} (id: ${data?.id})`)
}
