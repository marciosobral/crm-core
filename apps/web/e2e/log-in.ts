import type { Page } from "@playwright/test"

const demoEmail = "demo@crm-core.dev"

export const logIn = async (page: Page, password: string) => {
  await page.goto("/login")
  await page.getByLabel("E-mail profissional").fill(demoEmail)
  await page.getByLabel("Senha").fill(password)
  await page.getByRole("button", { name: "Entrar no CRM" }).click()
}
