import {
  CreateDealPayload,
  hasPermission,
  InvalidDealLead,
  InvalidDealSeller,
  OpenDealStatus,
} from "@crm/contract"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Result, Schema, SchemaIssue } from "effect"
import { type FormEvent, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { TopBar } from "#src/components/layout/top-bar.tsx"
import { Button } from "#src/components/ui/button.tsx"
import { CurrencyField } from "#src/components/ui/currency-field.tsx"
import { Select } from "#src/components/ui/select.tsx"
import { TextArea } from "#src/components/ui/text-area.tsx"
import { TextField } from "#src/components/ui/text-field.tsx"
import { runApi } from "#src/lib/api-client.ts"
import { meQueryOptions } from "#src/lib/auth.ts"
import { dealsQueryKey } from "#src/lib/deals.ts"
import { dealStatusLabels } from "#src/lib/labels.ts"
import { leadsQueryKey, leadsQueryOptions, sellersQueryOptions } from "#src/lib/leads.ts"
import type { SelectOption } from "#src/lib/use-select.ts"

export const Route = createFileRoute("/_authenticated/deals/new")({
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions)
    if (hasPermission(user, "deal.assign_any"))
      await context.queryClient.ensureQueryData(sellersQueryOptions)
  },
  component: NewDeal,
})

type FormValues = {
  title: string
  leadId: string
  sellerId: string
  valueCents: number
  status: string
  expectedCloseDate: string
  description: string
}

type FormField = keyof FormValues

const fieldOrder: ReadonlyArray<FormField> = [
  "title",
  "leadId",
  "sellerId",
  "valueCents",
  "status",
  "expectedCloseDate",
  "description",
]

const emptyForm: FormValues = {
  title: "",
  leadId: "",
  sellerId: "",
  valueCents: 0,
  status: "NEW",
  expectedCloseDate: "",
  description: "",
}

const fieldErrorMessages: Record<FormField, string> = {
  title: "Informe o nome do negócio.",
  leadId: "Selecione um lead.",
  sellerId: "Selecione um vendedor válido.",
  valueCents: "Informe um valor maior que zero.",
  status: "Selecione o status.",
  expectedCloseDate: "Informe uma data válida.",
  description: "Texto muito longo.",
}

const isFormField = (key: unknown): key is FormField =>
  typeof key === "string" && key in fieldErrorMessages

const firstPathKey = (segment: PropertyKey | { readonly key: PropertyKey } | undefined) =>
  typeof segment === "object" ? segment.key : segment

function SellerSelect({
  value,
  error,
  onChange,
}: {
  value: string
  error: string | undefined
  onChange: (value: string) => void
}) {
  const { data: sellers } = useSuspenseQuery(sellersQueryOptions)

  return (
    <Select
      label="Vendedor Responsável"
      required
      value={value}
      error={error}
      name="sellerId"
      searchable
      placeholder="Selecionar vendedor"
      options={sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
      onChange={onChange}
    />
  )
}

function NewDeal() {
  const { data: user } = useSuspenseQuery(meQueryOptions)
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const [values, setValues] = useState<FormValues>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({})
  const [selectedLeadLabel, setSelectedLeadLabel] = useState("")
  const [searchText, setSearchText] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const canAssign = hasPermission(user, "deal.assign_any")

  const leadsQuery = useQuery({
    ...leadsQueryOptions(searchText ? { search: searchText } : {}),
    placeholderData: keepPreviousData,
  })
  const leadOptions: ReadonlyArray<SelectOption> = (leadsQuery.data ?? [])
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
      } else if (error instanceof InvalidDealSeller) {
        flushSync(() => setErrors({ sellerId: fieldErrorMessages.sellerId }))
        focusField("sellerId")
      }
    },
  })

  const setValue = (field: FormField, value: string | number) => {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors(({ [field]: _removed, ...rest }) => rest)
  }

  const onLeadChange = (leadId: string) => {
    setSelectedLeadLabel(leadOptions.find((option) => option.value === leadId)?.label ?? "")
    setValue("leadId", leadId)
    if (!canAssign) return
    const lead = leadsQuery.data?.find((candidate) => candidate.id === leadId)
    if (lead) setValue("sellerId", lead.seller.id)
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = Schema.decodeUnknownResult(CreateDealPayload, { errors: "all" })({
      title: values.title,
      leadId: values.leadId,
      valueCents: values.valueCents,
      status: values.status,
      ...(canAssign ? { sellerId: values.sellerId } : {}),
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
            <Select
              label="Lead Vinculado"
              name="leadId"
              required
              searchable
              placeholder="Buscar lead cadastrado..."
              error={errors.leadId}
              value={values.leadId}
              options={leadOptions}
              onChange={onLeadChange}
              onSearchChange={setSearchText}
              isLoading={leadsQuery.isFetching}
              emptyMessage="Nenhum lead encontrado"
              selectedLabel={selectedLeadLabel}
            />
            {canAssign && (
              <SellerSelect
                value={values.sellerId}
                error={errors.sellerId}
                onChange={(value) => setValue("sellerId", value)}
              />
            )}
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
              placeholder="Selecione o status"
              options={OpenDealStatus.literals.map((status) => ({
                value: status,
                label: dealStatusLabels[status],
              }))}
              onChange={(status) => setValue("status", status)}
            />
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

          {createMutation.isError &&
            !(
              createMutation.error instanceof InvalidDealLead ||
              createMutation.error instanceof InvalidDealSeller
            ) && (
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
