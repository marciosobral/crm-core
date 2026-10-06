import { Schema } from "effect"

export const AiFeature = Schema.Literals(["NEXT_STEP", "ASSISTANT_CHAT", "ASSISTANT_SUMMARY"])
export type AiFeature = typeof AiFeature.Type

export const assistantFeatures = {
  NEXT_STEP: { perMinute: 5 },
  ASSISTANT_CHAT: { perMinute: 10 },
  ASSISTANT_SUMMARY: { perMinute: 60 },
} as const satisfies Record<AiFeature, { readonly perMinute: number }>
