import {
  CloseDealPayload,
  type Deal,
  DealClosed,
  formatDealValue,
  LostReason,
  lostReasonLabels,
} from "@crm/contract"
import { Result, Schema, SchemaIssue } from "effect"
import { X } from "lucide-react"
import { type FormEvent, type MouseEvent, useState } from "react"
import { flushSync } from "react-dom"
import { Button } from "#src/components/ui/button.tsx"
import { Select } from "#src/components/ui/select.tsx"
import { TextArea } from "#src/components/ui/text-area.tsx"
import { firstPathKey } from "#src/lib/form-errors.ts"
import { useCloseDeal } from "#src/lib/use-close-deal.ts"

type CloseDealMode = "choose" | "WON" | "LOST"

type LostField = "reason" | "note"

type CloseDealDialogProps = {
  deal: Deal
  initialMode: CloseDealMode
  onDismiss: () => void
  onClosed: (deal: Deal) => void
}

const wonButtonClasses = "bg-status-won text-canvas hover:bg-status-won/85"
const lostButtonClasses = "bg-status-lost text-canvas hover:bg-status-lost/85"

const focusPrimaryControl = (dialog: HTMLDialogElement | null) =>
  dialog?.querySelector<HTMLElement>("[data-primary-control], [name='reason']")?.focus()

const openModal = (dialog: HTMLDialogElement | null) => {
  if (dialog && !dialog.open) {
    dialog.showModal()
    focusPrimaryControl(dialog)
  }
}

export function CloseDealDialog({ deal, initialMode, onDismiss, onClosed }: CloseDealDialogProps) {
  const [mode, setMode] = useState<CloseDealMode>(initialMode)
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")
  const [errors, setErrors] = useState<Partial<Record<LostField, string>>>({})
  const closeMutation = useCloseDeal({ onClosed })

  const switchMode = (event: MouseEvent<HTMLElement>, nextMode: CloseDealMode) => {
    const dialog = event.currentTarget.closest("dialog")
    flushSync(() => setMode(nextMode))
    focusPrimaryControl(dialog)
  }

  // Native dialogs ignore backdrop clicks; a click whose target is the dialog itself landed outside its content.
  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget && !closeMutation.isPending) onDismiss()
  }

  const confirmWon = () => closeMutation.mutate({ deal, payload: { result: "WON" } })

  const onLostSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const result = Schema.decodeUnknownResult(CloseDealPayload, { errors: "all" })({
      result: "LOST",
      reason,
      ...(note === "" ? {} : { note }),
    })

    if (Result.isSuccess(result)) {
      setErrors({})
      closeMutation.mutate({ deal, payload: result.success })
      return
    }

    const formatter = SchemaIssue.makeFormatterStandardSchemaV1()
    const nextErrors: Partial<Record<LostField, string>> = {}
    for (const issue of formatter(result.failure.issue).issues) {
      const key = firstPathKey(issue.path?.[0])
      if (key === "reason") nextErrors.reason ??= "Selecione o motivo."
      else
        nextErrors.note ??=
          reason === "OTHER" && note.trim() === "" ? "Descreva o motivo." : "Texto muito longo."
    }
    // Focus only after the errors are committed so assistive tech announces the field together with its message.
    flushSync(() => setErrors(nextErrors))
    const firstInvalid = nextErrors.reason ? "reason" : nextErrors.note ? "note" : undefined
    const element = firstInvalid && form.elements.namedItem(firstInvalid)
    if (element instanceof HTMLElement) element.focus()
  }

  const heading =
    mode === "choose"
      ? "Fechar negócio"
      : mode === "WON"
        ? "Marcar negócio como ganho?"
        : "Marcar negócio como perdido"

  const dealSummary = (
    <p className="text-sm text-muted">
      {deal.title} · {formatDealValue(deal.valueCents)}
    </p>
  )

  const errorAlert = closeMutation.isError && (
    <p role="alert" className="text-sm text-red-400">
      {closeMutation.error instanceof DealClosed
        ? "Este negócio já foi fechado."
        : "Não foi possível fechar o negócio. Tente novamente."}
    </p>
  )

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click only adds backdrop dismissal; keyboard users dismiss with Esc or Cancelar.
    <dialog
      ref={openModal}
      aria-labelledby="close-deal-heading"
      onCancel={(event) => {
        event.preventDefault()
        if (!closeMutation.isPending) onDismiss()
      }}
      onClick={onBackdropClick}
      className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-white backdrop:bg-black/60"
    >
      <div className="space-y-5 p-5 md:p-6">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h2 id="close-deal-heading" className="font-heading text-lg font-bold leading-tight">
              {heading}
            </h2>
            <button
              type="button"
              aria-label="Fechar"
              disabled={closeMutation.isPending}
              className="text-muted hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onDismiss}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {mode !== "LOST" && dealSummary}
        </div>

        {mode === "choose" && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              data-primary-control
              className={`w-full sm:flex-1 ${wonButtonClasses}`}
              onClick={(event) => switchMode(event, "WON")}
            >
              Ganho
            </Button>
            <Button
              className={`w-full sm:flex-1 ${lostButtonClasses}`}
              onClick={(event) => switchMode(event, "LOST")}
            >
              Perdido
            </Button>
          </div>
        )}

        {mode === "WON" && (
          <>
            {errorAlert}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" disabled={closeMutation.isPending} onClick={onDismiss}>
                Cancelar
              </Button>
              <Button
                data-primary-control
                className={wonButtonClasses}
                disabled={closeMutation.isPending}
                onClick={confirmWon}
              >
                {closeMutation.isPending ? "Salvando..." : "Confirmar Ganho"}
              </Button>
            </div>
          </>
        )}

        {mode === "LOST" && (
          <form onSubmit={onLostSubmit} noValidate className="space-y-5">
            {dealSummary}
            <Select
              label="Motivo da perda"
              name="reason"
              required
              placeholder="Selecione o motivo"
              value={reason}
              error={errors.reason}
              options={LostReason.literals.map((option) => ({
                value: option,
                label: lostReasonLabels[option],
              }))}
              onChange={(value) => {
                setReason(value)
                setErrors(({ reason: _removed, ...rest }) => rest)
              }}
            />
            <TextArea
              label="Detalhes"
              name="note"
              required={reason === "OTHER"}
              placeholder="Conte o que aconteceu"
              value={note}
              error={errors.note}
              onChange={(event) => {
                setNote(event.target.value)
                setErrors(({ note: _removed, ...rest }) => rest)
              }}
            />
            {errorAlert}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" disabled={closeMutation.isPending} onClick={onDismiss}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className={lostButtonClasses}
                disabled={closeMutation.isPending}
              >
                {closeMutation.isPending ? "Salvando..." : "Confirmar Perda"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}
