import { Locator, Page } from '@playwright/test'

import { BasePage } from './BasePage'

export class CatalogPage extends BasePage {
  readonly gymsPage: Locator
  readonly tasksPage: Locator
  readonly modelsPage: Locator

  constructor(page: Page) {
    super(page)
    this.gymsPage = this.byDataId('gyms-page')
    this.tasksPage = this.byDataId('tasks-page')
    this.modelsPage = this.byDataId('models-page')
  }

  gymCard(id: string) {
    return this.byDataId(`gym-card-${id}`)
  }

  taskCard(id: string) {
    return this.byDataId(`task-card-${id}`)
  }

  modelCard(id: string) {
    return this.byDataId(`model-card-${id}`)
  }
}
