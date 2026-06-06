import { Locator, Page } from '@playwright/test'

import { BasePage } from './BasePage'

export class CatalogPage extends BasePage {
  readonly gymsPage: Locator
  readonly addGymButton: Locator
  readonly gymFormCard: Locator
  readonly tasksPage: Locator
  readonly addTaskButton: Locator
  readonly taskFormCard: Locator
  readonly tasksSearch: Locator
  readonly modelsPage: Locator

  constructor(page: Page) {
    super(page)
    this.gymsPage = this.byDataId('gyms-page')
    this.addGymButton = this.byDataId('add-gym-button')
    this.gymFormCard = this.byDataId('gym-form-card')
    this.tasksPage = this.byDataId('tasks-page')
    this.addTaskButton = this.byDataId('add-task-button')
    this.taskFormCard = this.byDataId('task-form-card')
    this.tasksSearch = this.byDataId('tasks-search')
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
