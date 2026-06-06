import { Locator, Page } from '@playwright/test'

import { BasePage } from './BasePage'
import { routes } from '../fixtures/test-data'

export class AuthPage extends BasePage {
  readonly loginPage: Locator
  readonly loginForm: Locator
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator

  constructor(page: Page) {
    super(page)
    this.loginPage = this.byDataId('login-page')
    this.loginForm = this.byDataId('login-form')
    this.emailInput = this.byDataId('login-email')
    this.passwordInput = this.byDataId('login-password')
    this.submitButton = this.byDataId('login-submit')
  }

  async gotoLogin() {
    await this.goto(routes.login)
  }
}
