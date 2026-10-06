import type { Deal, DealActivity } from "@crm/contract"
import { DateTime } from "effect"
import type { Prompt } from "effect/unstable/ai"

const maxActivities = 20

const instructions = [
  "You are a sales assistant inside a CRM.",
  "Suggest exactly one concrete next action for the seller responsible for the deal,",
  "and one short sentence explaining why, grounded only in the deal data and its timeline.",
  "Do not invent facts. Write both fields in Brazilian Portuguese.",
].join(" ")

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

const describeActivity = (activity: DealActivity) => {
  switch (activity.kind) {
    case "COMMENT":
      return `${activity.author.name} commented: ${activity.body}`
    case "CREATED":
      return `${activity.author.name} created the deal`
    case "SELLER_ASSIGNED":
      return `${activity.author.name} assigned the deal to ${activity.seller.name}`
    case "STATUS_CHANGED":
      return `${activity.author.name} moved the deal to ${activity.status}`
    case "WON":
      return `${activity.author.name} closed the deal as won`
    case "LOST":
      return `${activity.author.name} closed the deal as lost (${activity.lostReason})`
  }
}

export const nextStepPrompt = (
  deal: Deal,
  activities: ReadonlyArray<DealActivity>,
): Prompt.RawInput => {
  const timeline = activities
    .slice(0, maxActivities)
    .reverse()
    .map((activity) => `- ${DateTime.formatIso(activity.createdAt)} ${describeActivity(activity)}`)
  return [
    { role: "system", content: instructions },
    {
      role: "user",
      content: [
        `Deal: ${deal.title}`,
        `Status: ${deal.status}`,
        `Value: ${currency.format(deal.valueCents / 100)}`,
        `Expected close date: ${deal.expectedCloseDate ?? "not set"}`,
        `Lead: ${deal.lead.name} (${deal.lead.company})`,
        `Responsible seller: ${deal.seller.name}`,
        ...(deal.description ? [`Description: ${deal.description}`] : []),
        "Timeline, oldest first:",
        ...(timeline.length > 0 ? timeline : ["No activity yet"]),
      ].join("\n"),
    },
  ]
}
