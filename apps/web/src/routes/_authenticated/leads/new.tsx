import { CreateLeadPayload, hasPermission, InvalidLeadSeller, LeadSource } from "@crm/contract"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Result, Schema, SchemaIssue } from "effect"
import { type FormEvent, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { TopBar } from "../../../components/layout/top-bar.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { PhoneField } from "../../../components/ui/phone-field.tsx"
import { Select } from "../../../components/ui/select.tsx"
import { TextArea } from "../../../components/ui/text-area.tsx"
import { TextField } from "../../../components/ui/text-field.tsx"
import { runApi } from "../../../lib/api-client.ts"
import { meQueryOptions } from "../../../lib/auth.ts"
import { sourceLabels } from "../../../lib/labels.ts"
import { leadsQueryKey, sellersQueryOptions } from "../../../lib/leads.ts"

export const Route = createFileRoute("/_authenticated/leads/new")({
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions)
    if (hasPermission(user, "lead.assign_any"))
      await context.queryClient.ensureQueryData(sellersQueryOptions)
  },
  component: NewLead,
})

type FormValues = {
  name: string
  company: string
  email: string
  phone: string
  jobTitle: string
  source: string
  sellerId: string
  notes: string
}

type FormField = keyof FormValues

const fieldOrder: ReadonlyArray<FormField> = [
  "name",
  "company",
  "email",
  "phone",
  "jobTitle",
  "source",
  "sellerId",
  "notes",
]

const emptyForm: FormValues = {
  name: "",
  company: "",
  email: "",
  phone: "",
  jobTitle: "",
  source: "",
  sellerId: "",
  notes: "",
}

const fieldErrorMessages: Record<FormField, string> = {
  name: "Informe o nome.",
  company: "Informe a empresa.",
  email: "Informe um e-mail válido.",
  phone: "Informe um telefone com DDD.",
  source: "Selecione a origem.",
  sellerId: "Selecione um vendedor válido.",
  jobTitle: "Texto muito longo.",
  notes: "Texto muito longo.",
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
    <div className="md:col-span-2">
      <Select
        label="Vendedor Responsável"
        required
        value={value}
        error={error}
        name="sellerId"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Atribuir a um vendedor</option>
        {sellers.map((seller) => (
          <option key={seller.id} value={seller.id}>
            {seller.name}
          </option>
        ))}
      </Select>
    </div>
  )
}

function NewLead() {
  const { data: user } = useSuspenseQuery(meQueryOptions)
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const [values, setValues] = useState<FormValues>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({})
  const formRef = useRef<HTMLFormElement>(null)
  const canAssign = hasPermission(user, "lead.assign_any")

  const focusField = (field: FormField) => {
    const element = formRef.current?.elements.namedItem(field)
    if (element instanceof HTMLElement) element.focus()
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateLeadPayload) =>
      runApi((client) => client.leads.create({ payload })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [leadsQueryKey], refetchType: "all" })
      void navigate({ to: "/leads" })
    },
    onError: (error) => {
      if (error instanceof InvalidLeadSeller) {
        flushSync(() => setErrors({ sellerId: fieldErrorMessages.sellerId }))
        focusField("sellerId")
      }
    },
  })

  const setValue = (field: FormField, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors(({ [field]: _removed, ...rest }) => rest)
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = Schema.decodeUnknownResult(CreateLeadPayload, { errors: "all" })({
      name: values.name,
      company: values.company,
      email: values.email,
      phone: values.phone,
      source: values.source,
      ...(values.jobTitle === "" ? {} : { jobTitle: values.jobTitle }),
      ...(values.notes === "" ? {} : { notes: values.notes }),
      ...(canAssign ? { sellerId: values.sellerId } : {}),
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
      <TopBar title="Criar Novo Lead" />
      <form ref={formRef} onSubmit={onSubmit} noValidate className="p-4 md:p-8">
        <div className="w-full max-w-[800px] space-y-6 rounded-xl border border-line bg-surface p-5 md:p-8">
          <h2 className="font-heading text-lg font-bold leading-none">
            Informações Gerais do Contato
          </h2>
          <div className="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2">
            <TextField
              label="Nome Completo"
              name="name"
              required
              placeholder="Ex: Roberto Carlos da Silva"
              autoComplete="off"
              value={values.name}
              error={errors.name}
              onChange={(event) => setValue("name", event.target.value)}
            />
            <TextField
              label="Nome da Empresa / Condomínio"
              name="company"
              required
              placeholder="Ex: Academia FitLife Centro"
              autoComplete="off"
              value={values.company}
              error={errors.company}
              onChange={(event) => setValue("company", event.target.value)}
            />
            <TextField
              label="E-mail"
              name="email"
              type="email"
              required
              placeholder="contato@empresa.com.br"
              autoComplete="off"
              value={values.email}
              error={errors.email}
              onChange={(event) => setValue("email", event.target.value)}
            />
            <PhoneField
              label="Telefone"
              name="phone"
              required
              autoComplete="off"
              placeholder="(11) 99999-8888"
              value={values.phone}
              error={errors.phone}
              onValueChange={(digits) => setValue("phone", digits)}
            />
            <TextField
              label="Cargo"
              name="jobTitle"
              placeholder="Ex: Gerente Geral / Síndico"
              autoComplete="off"
              value={values.jobTitle}
              error={errors.jobTitle}
              onChange={(event) => setValue("jobTitle", event.target.value)}
            />
            <Select
              label="Origem do Lead"
              name="source"
              required
              value={values.source}
              error={errors.source}
              onChange={(event) => setValue("source", event.target.value)}
            >
              <option value="">Selecione a Origem</option>
              {LeadSource.literals.map((source) => (
                <option key={source} value={source}>
                  {sourceLabels[source]}
                </option>
              ))}
            </Select>
            {canAssign && (
              <SellerSelect
                value={values.sellerId}
                error={errors.sellerId}
                onChange={(value) => setValue("sellerId", value)}
              />
            )}
            <div className="md:col-span-2">
              <TextArea
                label="Observações e Histórico Preliminar"
                name="notes"
                placeholder="Ex: Cliente demonstrou interesse inicial em esteiras profissionais..."
                value={values.notes}
                error={errors.notes}
                onChange={(event) => setValue("notes", event.target.value)}
              />
            </div>
          </div>

          {createMutation.isError && !(createMutation.error instanceof InvalidLeadSeller) && (
            <p role="alert" className="text-sm text-red-400">
              Não foi possível salvar o lead. Tente novamente.
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={createMutation.isPending}
              onClick={() => void navigate({ to: "/leads" })}
            >
              Cancelar
            </Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Salvando..." : "Salvar Lead"}
            </Button>
          </div>
        </div>
      </form>
    </>
  )
}
