import { useEffect, useState } from 'react'
import { ArrowLeft, Boxes, LogOut, Menu, Moon, Shield, Sun, Workflow } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const navItems = [
  { path: '/gyms', label: 'Gyms', id: 'nav-gyms', icon: Boxes },
  { path: '/batches', label: 'Batches', id: 'nav-batches', icon: Workflow },
  { path: '/admin', label: 'Admin', id: 'nav-admin', admin: true, icon: Shield },
]

export function Layout() {
  const navigate = useNavigate()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const { isAdmin, logout, user } = useAuth()
  const userName = user?.displayName || user?.email?.split('@')[0] || 'User'
  const userEmail = user?.email || ''
  const userInitial = userName.charAt(0).toUpperCase()

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove(theme === 'light' ? 'dark' : 'light')
    root.classList.add(theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }

  return (
    <main data-id="app-shell" className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,color-mix(in_srgb,var(--hero-sky-from)_24%,transparent),transparent_32rem),linear-gradient(135deg,color-mix(in_srgb,var(--hero-sky-to)_50%,transparent),transparent_30rem),var(--canvas)] text-[var(--ink)] transition-colors duration-500">
      <div className="flex">
        <aside
          data-id="app-sidebar"
          className={cn(
            'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-[var(--hairline)] bg-[color-mix(in_srgb,var(--canvas)_92%,transparent)] backdrop-blur transition-all duration-300 ease-in-out',
            sidebarExpanded ? 'w-64' : 'w-16',
          )}
        >
          <div data-id="sidebar-header" className={cn('flex h-16 flex-shrink-0 items-center border-b border-[var(--hairline-soft)]', sidebarExpanded ? 'gap-3 px-4' : 'justify-center')}>
            {sidebarExpanded ? (
              <>
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] shadow-[var(--shadow-subtle)]">
                  <span className="text-sm font-bold text-[var(--on-primary)]">H</span>
                </div>
                <span className="truncate text-base font-bold tracking-tight">
                  Harness<span className="text-[var(--brand-green-deep)]">Studio</span>
                </span>
                <button data-id="sidebar-collapse" className="ml-auto rounded-md p-1.5 text-[var(--steel)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]" onClick={() => setSidebarExpanded(false)}>
                  <ArrowLeft size={18} />
                </button>
              </>
            ) : (
              <button data-id="sidebar-expand" className="rounded-md p-2 text-[var(--steel)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]" onClick={() => setSidebarExpanded(true)}>
                <Menu size={20} />
              </button>
            )}
          </div>

          <nav data-id="primary-nav" className="mt-2 flex flex-1 flex-col gap-1 p-2">
            {navItems.filter((item) => !item.admin || isAdmin).map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  data-id={item.id}
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  className={({ isActive }) =>
                    cn(
                      'harness-sidebar-nav-item group relative flex h-11 items-center',
                      isActive ? 'harness-sidebar-nav-item-active' : 'hover:bg-[var(--surface)] hover:text-[var(--ink)]',
                    )
                  }
                >
                  <div className="flex min-w-12 justify-center">
                    <Icon size={20} />
                  </div>
                  <span className={cn('overflow-hidden whitespace-nowrap text-sm transition-all duration-300', sidebarExpanded ? 'w-40 opacity-100' : 'w-0 opacity-0')}>
                    {item.label}
                  </span>
                  {!sidebarExpanded ? (
                    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--hairline-soft)] bg-[var(--ink)] px-2.5 py-1.5 text-xs font-medium text-[var(--canvas)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                      {item.label}
                    </span>
                  ) : null}
                </NavLink>
              )
            })}
          </nav>

          <div data-id="sidebar-footer" className="flex flex-col gap-1 border-t border-[var(--hairline-soft)] p-2">
            <button
              data-id="theme-toggle"
              className="harness-sidebar-nav-item group relative flex h-11 w-full items-center hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            >
              <div className="flex min-w-12 justify-center">
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </div>
              <span data-id="theme-label" className={cn('overflow-hidden whitespace-nowrap text-sm transition-all duration-300', sidebarExpanded ? 'w-40 opacity-100' : 'w-0 opacity-0')}>
                {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              </span>
              {!sidebarExpanded ? (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--hairline-soft)] bg-[var(--ink)] px-2.5 py-1.5 text-xs font-medium text-[var(--canvas)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                  {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                </span>
              ) : null}
            </button>

            <button
              data-id="logout-button"
              className="harness-sidebar-nav-item group relative flex h-11 w-full items-center hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              onClick={handleLogout}
              title="Logout"
            >
              <div className="flex min-w-12 justify-center">
                <LogOut size={20} />
              </div>
              <span className={cn('overflow-hidden whitespace-nowrap text-sm transition-all duration-300', sidebarExpanded ? 'w-40 opacity-100' : 'w-0 opacity-0')}>
                Logout
              </span>
              {!sidebarExpanded ? (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--hairline-soft)] bg-[var(--ink)] px-2.5 py-1.5 text-xs font-medium text-[var(--canvas)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                  Logout
                </span>
              ) : null}
            </button>

            <div
              data-id="header-current-user"
              className={cn(
                'group relative mt-1 flex items-center rounded-lg border border-[var(--hairline-soft)] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] shadow-[var(--shadow-subtle)] transition-colors hover:bg-[var(--surface)]',
                sidebarExpanded ? 'gap-3 p-3' : 'h-11 justify-center p-1',
              )}
            >
              <div className={cn('flex flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-semibold text-[var(--on-primary)] shadow-sm', sidebarExpanded ? 'h-9 w-9 text-sm' : 'h-8 w-8 text-xs')}>
                {userInitial}
              </div>
              {sidebarExpanded ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-5 text-[var(--ink)]">{userName}</p>
                  <p className="truncate text-xs leading-4 text-[var(--steel)]">{userEmail}</p>
                </div>
              ) : (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--hairline-soft)] bg-[var(--ink)] px-2.5 py-1.5 text-xs font-medium text-[var(--canvas)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                  {userName}
                </span>
              )}
            </div>
          </div>
        </aside>

        <main className={cn('min-h-screen flex-1 transition-all duration-300', sidebarExpanded ? 'ml-64' : 'ml-16')}>
          <section className="mx-auto max-w-7xl px-6 py-8">
            <Outlet />
          </section>
        </main>
      </div>
    </main>
  )
}
