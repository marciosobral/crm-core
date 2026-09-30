import { CreateDealPayload, InvalidDealLead, OpenDealStatus } from "@crm/contract"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Result, Schema, SchemaIssue } from "effect"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { TopBar } from "../../../components/layout/top-bar.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { Combobox, type ComboboxOption } from "../../../components/ui/combobox.tsx"
import { CurrencyField } from "../../../components/ui/currency-field.tsx"
import { Select } from "../../../components/ui/select.tsx"
import { TextArea } from "../../../components/ui/text-area.tsx"
import { TextField } from "../../../components/ui/text-field.tsx"
import { runApi } from "../../../lib/api-client.ts"
import { dealsQueryKey } from "../../../lib/deals.ts"
import { dealStatusLabels } from "../../../lib/labels.ts"
import { leadsQueryKey, leadsQueryOptions } from "../../../lib/leads.ts"

export const Route = createFileRoute("/_authenticated/deals/new")({
  component: NewDeal,
})

type FormValues = {
  title: string
  leadId: string
  valueCents: number
  status: string
  expectedCloseDate: string
  description: string
}

type FormField = keyof FormValues

const fieldOrder: ReadonlyArray<FormField> = [
  "title",
  "leadId",
  "valueCents",
  "status",
  "expectedCloseDate",
  "description",
]

const emptyForm: FormValues = {
  title: "",
  leadId: "",
  valueCents: 0,
  status: "NEW",
  expectedCloseDate: "",
  description: "",
}

const fieldErrorMessages: Record<FormField, string> = {
  title: "Informe o nome do negócio.",
  leadId: "Selecione um lead.",
  valueCents: "Informe um valor maior que zero.",
  status: "Selecione o status.",
  expectedCloseDate: "Informe uma data válida.",
  description: "Texto muito longo.",
}

const isFormField = (key: unknown): key is FormField =>
  typeof key === "string" && key in fieldErrorMessages

const firstPathKey = (segment: PropertyKey | { readonly key: PropertyKey } | undefined) =>
  typeof segment === "object" ? segment.key : segment

function NewDeal() {
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const [values, setValues] = useState<FormValues>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({})
  const [leadText, setLeadText] = useState("")
  const [typedText, setTypedText] = useState("")
  const [searchText, setSearchText] = useState("")
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const timeout = setTimeout(() => setSearchText(typedText), 300)
    return () => clearTimeout(timeout)
  }, [typedText])

  const leadsQuery = useQuery({
    ...leadsQueryOptions(searchText ? { search: searchText } : {}),
    placeholderData: keepPreviousData,
  })
  const leadOptions: ReadonlyArray<ComboboxOption> = (leadsQuery.data ?? [])
    .slice(0, 8)
    .map((lead) => ({ value: lead.id, label: `${lead.name} (${lead.company})` }))

  const focusField = (field: FormField) => {
    const element = formRef.current?.elements.namedItem(field)
    if (element instanceof HTMLElement) element.focus()
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateDealPayload) =>
      runApi((client) => client.deals.create({ payload })),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [dealsQueryKey], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: [leadsQueryKey], refetchType: "all" }),
      ])
      void navigate({ to: "/deals" })
    },
    onError: (error) => {
      if (error instanceof InvalidDealLead) {
        flushSync(() => setErrors({ leadId: fieldErrorMessages.leadId }))
        focusField("leadId")
      }
    },
  })

  const setValue = (field: FormField, value: string | number) => {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors(({ [field]: _removed, ...rest }) => rest)
  }

  const onLeadInputChange = (text: string) => {
    setLeadText(text)
    setTypedText(text)
    setValue("leadId", "")
  }

  const onLeadSelect = (option: ComboboxOption) => {
    setLeadText(option.label)
    setValue("leadId", option.value)
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = Schema.decodeUnknownResult(CreateDealPayload, { errors: "all" })({
      title: values.title,
      leadId: values.leadId,
      valueCents: values.valueCents,
      status: values.status,
      ...(values.expectedCloseDate === "" ? {} : { expectedCloseDate: values.expectedCloseDate }),
      ...(values.description === "" ? {} : { description: values.description }),
    })

    if (Result.isSuccess(result)) {
      setErrors({})
      createMutation.mutate(result.success)
      return
    }

    const formatter = SchemaIssue.makeFormatterStandardSchemaV1()
    const nextErrors: Partial<Record<FormField, string>> = {}
    for (const issue of formatter(result.failure.issue).issues) {
      const key = firstPathKey(issue.path?.[0])
      if (isFormField(key)) nextErrors[key] ??= fieldErrorMessages[key]
    }
    // Focus only after the errors are committed so assistive tech announces the field together with its message.
    flushSync(() => setErrors(nextErrors))
    const firstInvalid = fieldOrder.find((field) => nextErrors[field])
    if (firstInvalid) focusField(firstInvalid)
  }

  return (
    <>
      <TopBar title="Cadastrar Novo Negócio" />
      <form ref={formRef} onSubmit={onSubmit} noValidate className="p-4 md:p-8">
        <div className="w-full max-w-[800px] space-y-6 rounded-xl border border-line bg-surface p-5 md:p-8">
          <h2 className="font-heading text-lg font-bold leading-none">
            Vincular Negócio ao Pipeline
          </h2>
          <div className="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2">
            <TextField
              label="Nome do negócio"
              name="title"
              required
              placeholder="Ex: Academia FitLife - 12 Esteiras"
              autoComplete="off"
              value={values.title}
              error={errors.title}
              onChange={(event) => setValue("title", event.target.value)}
            />
            <Combobox
              label="Lead Vinculado"
              name="leadId"
              required
              placeholder="Buscar lead cadastrado..."
              error={errors.leadId}
              inputValue={leadText}
              onInputChange={onLeadInputChange}
              options={leadOptions}
              isLoading={leadsQuery.isPending}
              emptyMessage="Nenhum lead encontrado"
              onSelect={onLeadSelect}
            />
            <CurrencyField
              label="Valor Estimado (R$)"
              name="valueCents"
              required
              placeholder="R$ 0,00"
              autoComplete="off"
              cents={values.valueCents}
              error={errors.valueCents}
              onCentsChange={(cents) => setValue("valueCents", cents)}
            />
            <Select
              label="Status Inicial no Funil"
              name="status"
              required
              value={values.status}
              error={errors.status}
              onChange={(event) => setValue("status", event.target.value)}
            >
              {OpenDealStatus.literals.map((status) => (
                <option key={status} value={status}>
                  {dealStatusLabels[status]}
                </option>
              ))}
            </Select>
            <TextField
              label="Data Prevista de Fechamento"
              name="expectedCloseDate"
              type="date"
              className="[color-scheme:dark]"
              value={values.expectedCloseDate}
              error={errors.expectedCloseDate}
              onChange={(event) => setValue("expectedCloseDate", event.target.value)}
            />
            <div className="md:col-span-2">
              <TextArea
                label="Descrição do negócio & Escopo"
                name="description"
                placeholder="Quais equipamentos, condições de pagamento solicitadas, etc."
                value={values.description}
                error={errors.description}
                onChange={(event) => setValue("description", event.target.value)}
              />
            </div>
          </div>

          {createMutation.isError && !(createMutation.error instanceof InvalidDealLead) && (
            <p role="alert" className="text-sm text-red-400">
              Não foi possível salvar o negócio. Tente novamente.
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={createMutation.isPending}
              onClick={() => void navigate({ to: "/deals" })}
            >
              Cancelar
            </Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Salvando..." : "Criar Negócio"}
            </Button>
          </div>
        </div>
      </form>
    </>
  )
}
