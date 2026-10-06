import { expect, test } from "@playwright/test"
import { logIn } from "./log-in.ts"

test("demo supervisor logs in and lands on the leads screen", async ({ page }) => {
  await logIn(page, "demo-crm-1234")

  await expect(page).toHaveURL(/\/leads$/)
  await expect(page.getByRole("heading", { name: "Lista de Leads" })).toBeVisible()
})

test("wrong password shows the login error and stays on the login screen", async ({ page }) => {
  await logIn(page, "wrong-password-1")

  await expect(page.getByRole("alert")).toHaveText("E-mail ou senha inválidos.")
  await expect(page).toHaveURL(/\/login$/)
})
