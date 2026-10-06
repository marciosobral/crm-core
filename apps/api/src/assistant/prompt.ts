import { type Deal, type DealActivity, dealStatusLabels, describeDealActivity } from "@crm/contract"
import { DateTime } from "effect"
import type { Prompt } from "effect/unstable/ai"
import { formatBrl, formatMinute } from "./format.ts"

const maxActivities = 20

const instructions = [
  "You are a sales assistant inside a CRM.",
  "Suggest exactly one concrete next action for the seller responsible for the deal,",
  "and one short sentence explaining why, grounded only in the deal data and its timeline.",
  "Do not invent facts. Write both fields in Brazilian Portuguese.",
].join(" ")

const describeTimelineEntry = (activity: DealActivity) =>
  activity.kind === "COMMENT"
    ? `${activity.author.name} comentou: ${activity.body}`
    : `${activity.author.name}: ${describeDealActivity(activity)}`

export const nextStepPrompt = (
  deal: Deal,
  activities: ReadonlyArray<DealActivity>,
  now: DateTime.Zoned,
): Prompt.RawInput => {
  const timeline = activities
    .slice(0, maxActivities)
    .reverse()
    .map(
      (activity) =>
        `- ${formatMinute(DateTime.setZone(activity.createdAt, now.zone))} ${describeTimelineEntry(activity)}`,
    )
  return [
    { role: "system", content: instructions },
    {
      role: "user",
      content: [
        `Now: ${formatMinute(now)} (${DateTime.zoneToString(now.zone)})`,
        `Deal: ${deal.title}`,
        `Status: ${dealStatusLabels[deal.status]}`,
        `Value: ${formatBrl(deal.valueCents)}`,
        `Expected close date: ${deal.expectedCloseDate ?? "not set"}`,
        `Lead: ${deal.lead.name} (${deal.lead.company})`,
        `Responsible seller: ${deal.seller.name}`,
        ...(deal.description ? [`Description: ${deal.description}`] : []),
        `Timeline, oldest first (${DateTime.zoneToString(now.zone)}):`,
        ...(timeline.length > 0 ? timeline : ["No activity yet"]),
      ].join("\n"),
    },
  ]
}
