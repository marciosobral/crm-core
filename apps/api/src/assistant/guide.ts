import type { AssistantScreen } from "@crm/contract"

export const screenLabels: Record<AssistantScreen, string> = {
  NEW_LEAD: "Novo lead",
  NEW_DEAL: "Novo negócio",
  LEADS: "Leads",
  DEALS: "Negócios",
}

export interface GuideEntry {
  readonly feature: string
  readonly steps: ReadonlyArray<string>
  readonly screen: AssistantScreen
}

export const crmGuide: ReadonlyArray<GuideEntry> = [
  {
    feature: "Criar um lead",
    steps: ['Abra "Leads" e clique em "Novo lead".', "Preencha nome, empresa, e-mail e telefone."],
    screen: "NEW_LEAD",
  },
  {
    feature: "Criar um negócio",
    steps: [
      'Abra "Negócios" e clique em "Novo negócio".',
      "Escolha o lead, informe título, valor e etapa.",
    ],
    screen: "NEW_DEAL",
  },
  {
    feature: "Mover um negócio no board",
    steps: [
      "No board, arraste o cartão para outra coluna.",
      "Também é possível pelo menu do cartão.",
    ],
    screen: "DEALS",
  },
  {
    feature: "Fechar um negócio como ganho ou perdido",
    steps: [
      'Abra o negócio e clique em "Fechar negócio" (ou arraste para a coluna "Fechado").',
      "Escolha Ganho, ou Perdido com o motivo.",
    ],
    screen: "DEALS",
  },
  {
    feature: "Comentar em um negócio",
    steps: ["Abra o negócio.", 'Escreva na linha do tempo e clique em "Comentar".'],
    screen: "DEALS",
  },
  {
    feature: "Ver detalhes e histórico de um negócio",
    steps: [
      "Clique no cartão do negócio no board.",
      "O painel mostra os dados e a linha do tempo.",
    ],
    screen: "DEALS",
  },
  {
    feature: "Filtrar o board",
    steps: ["Use a barra de filtros acima do board.", "Os filtros aplicados aparecem como chips."],
    screen: "DEALS",
  },
  {
    feature: "Pedir sugestão de próximo passo",
    steps: ["Abra um negócio em aberto.", 'Clique em "Sugerir próximo passo".'],
    screen: "DEALS",
  },
]

export const notSupported: ReadonlyArray<string> = [
  "Editar ou excluir leads",
  "Editar ou excluir negócios",
  "Reabrir um negócio fechado",
  "Gerenciar vendedores (eles vêm do cadastro inicial)",
  "Dashboard",
  "Ordenar manualmente os negócios dentro de uma coluna do board",
]
