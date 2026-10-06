type AssistantEmptyStateProps = {
  suggestions: ReadonlyArray<string>
  onSuggestion: (suggestion: string) => void
}

export function AssistantEmptyState({ suggestions, onSuggestion }: AssistantEmptyStateProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 overflow-y-auto py-4 pl-5 pr-4">
      <p className="text-sm text-zinc-100">
        Olá! Pergunte sobre seus leads e negócios, ou peça ajuda para usar o CRM.
      </p>
      <div className="flex flex-col items-start gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-zinc-100 hover:bg-line focus-visible:outline-2 focus-visible:outline-brand"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
