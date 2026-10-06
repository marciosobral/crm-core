import { CreateLeadPayload, hasPermission, InvalidLeadSeller, LeadSource } from "@crm/contract"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Result, Schema } from "effect"
import { type FormEvent, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { SellerSelect } from "#src/components/layout/seller-select.tsx"
import { TopBar } from "#src/components/layout/top-bar.tsx"
import { Button } from "#src/components/ui/button.tsx"
import { PhoneField } from "#src/components/ui/phone-field.tsx"
import { Select } from "#src/components/ui/select.tsx"
import { TextArea } from "#src/components/ui/text-area.tsx"
import { TextField } from "#src/components/ui/text-field.tsx"
import { runApi } from "#src/lib/api-client.ts"
import { meQueryOptions } from "#src/lib/auth.ts"
import { fieldErrorsFromIssue } from "#src/lib/form-errors.ts"
import { sourceLabels } from "#src/lib/labels.ts"
import { ensureSellersIfPermitted, leadsQueryKey } from "#src/lib/leads.ts"

export const Route = createFileRoute("/_authenticated/leads/new")({
  loader: async ({ context }) => {
    await ensureSellersIfPermitted(context.queryClient, "lead.assign_any")
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

    const nextErrors = fieldErrorsFromIssue(result.failure.issue, fieldErrorMessages)
    // Focus only after the errors are committed so assistive tech announces the field together with its message.
    flushSync(() => setErrors(nextErrors))
    const firstInvalid = fieldOrder.find((field) => nextErrors[field])
    if (firstInvalid) focusField(firstInvalid)
  }

  return (
    <>
      <TopBar title="Criar Novo Lead" />
      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        className="px-4 pt-4 pb-assistant-clearance md:px-8 md:pt-8"
      >
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
              label="Origem do lead"
              name="source"
              required
              value={values.source}
              error={errors.source}
              placeholder="Selecione a origem"
              options={LeadSource.literals.map((source) => ({
                value: source,
                label: sourceLabels[source],
              }))}
              onChange={(source) => setValue("source", source)}
            />
            {canAssign && (
              <div className="md:col-span-2">
                <SellerSelect
                  value={values.sellerId}
                  error={errors.sellerId}
                  placeholder="Atribuir a um vendedor"
                  onChange={(value) => setValue("sellerId", value)}
                />
              </div>
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
