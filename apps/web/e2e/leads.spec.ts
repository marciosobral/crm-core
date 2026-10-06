import { expect, test } from "@playwright/test"
import { logIn } from "./log-in.ts"

test("a logged-in supervisor creates a lead and sees it in the list", async ({ page }) => {
  const leadName = `Lead E2E ${Date.now()}`

  await logIn(page, "demo-crm-1234")
  await expect(page.getByRole("heading", { name: "Lista de Leads" })).toBeVisible()

  await page.getByRole("link", { name: "Novo Lead" }).click()
  await page.getByLabel("Nome Completo").fill(leadName)
  await page.getByLabel("Nome da Empresa / Condomínio").fill("Empresa E2E")
  await page.getByLabel(/^E-mail/).fill("e2e@empresa-e2e.com.br")
  await page.getByLabel("Telefone").fill("11999998888")
  await page.getByRole("combobox", { name: "Origem do lead" }).click()
  await page.getByRole("option", { name: "Site" }).click()
  await page.getByRole("combobox", { name: "Vendedor Responsável" }).click()
  await page.getByRole("option").first().click()
  await page.getByRole("button", { name: "Salvar Lead" }).click()

  await expect(page).toHaveURL(/\/leads$/)
  await expect(page.getByRole("cell", { name: leadName })).toBeVisible()
})
