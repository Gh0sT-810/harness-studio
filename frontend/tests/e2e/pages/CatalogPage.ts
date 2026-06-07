import { Locator, Page } from '@playwright/test'

import { BasePage } from './BasePage'

export class CatalogPage extends BasePage {
  readonly gymsPage: Locator
  readonly gymsHeaderSection: Locator
  readonly gymsActionsSection: Locator
  readonly gymsActionsLabel: Locator
  readonly addGymButton: Locator
  readonly gymFormCard: Locator
  readonly tasksPage: Locator
  readonly tasksHeaderSection: Locator
  readonly tasksActionsSection: Locator
  readonly tasksActionsLabel: Locator
  readonly tasksBackToGyms: Locator
  readonly addTaskButton: Locator
  readonly taskFormCard: Locator
  readonly taskEditPage: Locator
  readonly taskEditBackToTasks: Locator
  readonly tasksSearch: Locator
  readonly modelsPage: Locator

  constructor(page: Page) {
    super(page)
    this.gymsPage = this.byDataId('gyms-page')
    this.gymsHeaderSection = this.byDataId('gyms-header-section')
    this.gymsActionsSection = this.byDataId('gyms-actions-section')
    this.gymsActionsLabel = this.byDataId('gyms-actions-label')
    this.addGymButton = this.byDataId('add-gym-button')
    this.gymFormCard = this.byDataId('gym-form-card')
    this.tasksPage = this.byDataId('tasks-page')
    this.tasksHeaderSection = this.byDataId('tasks-header-section')
    this.tasksActionsSection = this.byDataId('tasks-actions-section')
    this.tasksActionsLabel = this.byDataId('tasks-actions-label')
    this.tasksBackToGyms = this.byDataId('tasks-back-to-gyms')
    this.addTaskButton = this.byDataId('add-task-button')
    this.taskFormCard = this.byDataId('task-form-card')
    this.taskEditPage = this.byDataId('task-edit-page')
    this.taskEditBackToTasks = this.byDataId('task-edit-back-to-tasks')
    this.tasksSearch = this.byDataId('tasks-search')
    this.modelsPage = this.byDataId('models-page')
  }

  gymCard(id: string) {
    return this.byDataId(`gym-card-${id}`)
  }

  gymTasksLink(id: string) {
    return this.byDataId(`gym-tasks-link-${id}`)
  }

  taskCard(id: string) {
    return this.byDataId(`task-card-${id}`)
  }

  taskEditButton(id: string) {
    return this.byDataId(`task-edit-${id}`)
  }

  taskIdInput() {
    return this.byDataId('task-id-input')
  }

  gymStrategySelect() {
    return this.byDataId('gym-strategy-select')
  }

  gymStrategySelectContent() {
    return this.byDataId('gym-strategy-select-content')
  }

  gymStrategySelectOption(strategy: string) {
    return this.byDataId(`gym-strategy-select-option-${strategy}`)
  }

  modelCard(id: string) {
    return this.byDataId(`model-card-${id}`)
  }
}
