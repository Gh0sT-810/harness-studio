import { Locator, Page } from '@playwright/test'

import { BasePage } from './BasePage'

export class AdminPage extends BasePage {
  readonly adminPage: Locator
  readonly adminTabs: Locator
  readonly usersTab: Locator
  readonly domainsTab: Locator
  readonly modelsTab: Locator
  readonly usersCard: Locator
  readonly domainsCard: Locator
  readonly modelsPage: Locator

  constructor(page: Page) {
    super(page)
    this.adminPage = this.byDataId('admin-page')
    this.adminTabs = this.byDataId('admin-tabs')
    this.usersTab = this.byDataId('admin-tab-users')
    this.domainsTab = this.byDataId('admin-tab-domains')
    this.modelsTab = this.byDataId('admin-tab-models')
    this.usersCard = this.byDataId('admin-users-card')
    this.domainsCard = this.byDataId('admin-domains-card')
    this.modelsPage = this.byDataId('models-page')
  }

  modelCard(id: string) {
    return this.byDataId(`model-card-${id}`)
  }

  modelDefaultBadge(id: string) {
    return this.byDataId(`model-default-${id}`)
  }

  userRoleSelect(id: string) {
    return this.byDataId(`user-role-${id}`)
  }

  userRow(id: string) {
    return this.byDataId(`user-row-${id}`)
  }

  userName(id: string) {
    return this.byDataId(`user-name-${id}`)
  }

  userEmail(id: string) {
    return this.byDataId(`user-email-${id}`)
  }

  userRoleSelectContent(id: string) {
    return this.byDataId(`user-role-${id}-content`)
  }

  userRoleSelectOption(id: string, role: string) {
    return this.byDataId(`user-role-${id}-option-${role}`)
  }
}
