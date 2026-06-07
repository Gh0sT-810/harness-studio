import { expect, Locator, Page } from '@playwright/test'

import { BasePage } from './BasePage'

export class AppShellPage extends BasePage {
  readonly shell: Locator
  readonly sidebar: Locator
  readonly expandToggle: Locator
  readonly collapseToggle: Locator
  readonly themeToggle: Locator
  readonly gymsNav: Locator
  readonly modelsNav: Locator
  readonly batchesNav: Locator
  readonly adminNav: Locator

  constructor(page: Page) {
    super(page)
    this.shell = this.byDataId('app-shell')
    this.sidebar = this.byDataId('app-sidebar')
    this.expandToggle = this.byDataId('sidebar-expand')
    this.collapseToggle = this.byDataId('sidebar-collapse')
    this.themeToggle = this.byDataId('theme-toggle')
    this.gymsNav = this.byDataId('nav-gyms')
    this.modelsNav = this.byDataId('nav-models')
    this.batchesNav = this.byDataId('nav-batches')
    this.adminNav = this.byDataId('nav-admin')
  }

  async expandSidebar() {
    await this.expandToggle.click()
  }

  async collapseSidebar() {
    await this.collapseToggle.click()
  }

  async toggleTheme() {
    await this.themeToggle.click()
  }

  async expectSidebarExpanded() {
    await expect(this.sidebar).toHaveClass(/w-64/)
  }

  async expectSidebarCollapsed() {
    await expect(this.sidebar).toHaveClass(/w-16/)
  }
}
