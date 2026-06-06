import { Page } from '@playwright/test'

export class BasePage {
  constructor(readonly page: Page) {}

  async goto(path: string) {
    await this.page.goto(path)
  }

  byDataId(id: string) {
    return this.page.locator(`[data-id="${id}"]`)
  }
}
