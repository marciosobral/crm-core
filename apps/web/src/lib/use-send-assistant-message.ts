import type { AssistantConversation, AssistantMessage, AssistantToolName } from "@crm/contract"
import { conversationTitleMaxLength, truncate } from "@crm/contract"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { runApi } from "./api-client.ts"
import { assistantQueryKey, conversationQueryOptions, pageContextFrom } from "./assistant.ts"

type SendAssistantMessageOptions = {
  conversationId: string | undefined
  onStart: () => void
  onFailure: (message: string) => void
  onConversationSaved: (conversationId: string) => void
}

export function useSendAssistantMessage({
  conversationId,
  onStart,
  onFailure,
  onConversationSaved,
}: SendAssistantMessageOptions) {
  const queryClient = useQueryClient()
  const router = useRouter()
  // Replies the server chose not to keep (refused, or rejected by the output guard): shown, never in the history.
  const [unsavedMessages, setUnsavedMessages] = useState<ReadonlyArray<AssistantMessage>>([])
  const [toolsUsed, setToolsUsed] = useState<ReadonlyArray<AssistantToolName>>([])
  const [announcement, setAnnouncement] = useState("")

  const mutation = useMutation({
    mutationFn: (message: string) =>
      runApi((client) =>
        client.assistant.sendMessage({
          payload: {
            ...(conversationId ? { conversationId } : {}),
            message,
            context: pageContextFrom(
              router.state.location.pathname,
              router.state.location.searchStr,
            ),
          },
        }),
      ),
    onMutate: () => {
      onStart()
      setAnnouncement("")
    },
    onError: (_error, message) => onFailure(message),
    onSuccess: (result) => {
      const savedConversationId = result.conversationId
      if (result.isSaved && savedConversationId !== null) {
        const appendExchange = (
          previous: AssistantConversation | undefined,
        ): AssistantConversation => ({
          id: savedConversationId,
          title:
            previous?.title ?? truncate(result.userMessage.content, conversationTitleMaxLength),
          messages: [...(previous?.messages ?? []), result.userMessage, result.reply],
        })
        queryClient.setQueryData(
          conversationQueryOptions(savedConversationId).queryKey,
          appendExchange,
        )
        onConversationSaved(savedConversationId)
        setUnsavedMessages([])
      } else {
        setUnsavedMessages((previous) => [...previous, result.userMessage, result.reply])
      }
      setToolsUsed(result.toolsUsed)
      setAnnouncement(result.reply.content)
      void queryClient.invalidateQueries({ queryKey: [assistantQueryKey] })
    },
  })

  const clearResults = () => {
    setUnsavedMessages([])
    setToolsUsed([])
  }

  return { mutation, unsavedMessages, toolsUsed, announcement, clearResults }
}
