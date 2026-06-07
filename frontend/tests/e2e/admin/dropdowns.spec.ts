import { expect, test } from '@playwright/test'

import { mockGym, mockPhase2Api, seededAdmin, seedAuthenticatedState } from '../helpers/mock-api'
import { AdminPage } from '../pages/AdminPage'
import { CatalogPage } from '../pages/CatalogPage'

test.describe('Styled Dropdowns', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('uses styled select menus for admin role and gym strategy controls', async ({ page }) => {
    const admin = new AdminPage(page)
    const catalog = new CatalogPage(page)
    let selectedRole = seededAdmin.role

    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          message: 'users',
          statusCode: 200,
          data: [{ ...seededAdmin, role: selectedRole }],
        },
      })
    })
    await page.route(`**/api/users/${seededAdmin.id}/role`, async (route) => {
      const body = await route.request().postDataJSON() as { role: string }
      selectedRole = body.role
      await route.fulfill({
        json: {
          success: true,
          message: 'role updated',
          statusCode: 200,
          data: { ...seededAdmin, role: selectedRole },
        },
      })
    })

    await page.goto('/admin')
    await expect(admin.usersCard).toBeVisible()
    await expect(admin.userRow(seededAdmin.id)).toBeVisible()
    await expect(admin.userName(seededAdmin.id)).toHaveText(seededAdmin.displayName)
    await expect(admin.userEmail(seededAdmin.id)).toHaveText(seededAdmin.email)

    const nameBox = await admin.userName(seededAdmin.id).boundingBox()
    const emailBox = await admin.userEmail(seededAdmin.id).boundingBox()
    const roleBox = await admin.userRoleSelect(seededAdmin.id).boundingBox()
    expect(nameBox).not.toBeNull()
    expect(emailBox).not.toBeNull()
    expect(roleBox).not.toBeNull()
    expect(Math.abs(nameBox!.y - emailBox!.y)).toBeLessThan(3)
    expect(Math.abs(nameBox!.y - roleBox!.y)).toBeLessThan(12)
    expect(nameBox!.x).toBeLessThan(emailBox!.x)
    expect(emailBox!.x).toBeLessThan(roleBox!.x)
    expect(roleBox!.width).toBeLessThan(220)

    await admin.userRoleSelect(seededAdmin.id).click()
    await expect(admin.userRoleSelectContent(seededAdmin.id)).toBeVisible()
    await expect(admin.userRoleSelectOption(seededAdmin.id, 'auditor')).toBeVisible()
    await admin.userRoleSelectOption(seededAdmin.id, 'auditor').click()
    await expect(admin.userRoleSelect(seededAdmin.id)).toContainText('auditor')

    await page.goto('/gyms')
    await catalog.addGymButton.click()
    await expect(catalog.gymFormCard).toBeVisible()

    await catalog.gymStrategySelect().click()
    await expect(catalog.gymStrategySelectContent()).toBeVisible()
    await expect(catalog.gymStrategySelectOption('grader_config')).toBeVisible()
    await catalog.gymStrategySelectOption('grader_config').click()
    await expect(catalog.gymStrategySelect()).toContainText('grader_config')
    await expect(catalog.gymCard(mockGym.id)).toBeVisible()
  })
})
