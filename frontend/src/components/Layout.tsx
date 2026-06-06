import { useEffect, useState } from 'react'
import { ArrowLeft, Boxes, Database, LogOut, Menu, Moon, Shield, Sun, Workflow } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const navItems = [
  { path: '/gyms', label: 'Gyms', id: 'nav-gyms', icon: Boxes },
  { path: '/tasks', label: 'Tasks', id: 'nav-tasks', icon: Workflow },
  { path: '/models', label: 'Models', id: 'nav-models', icon: Database },
  { path: '/batches', label: 'Batches', id: 'nav-batches', icon: Workflow },
  { path: '/admin', label: 'Admin', id: 'nav-admin', admin: true, icon: Shield },
]

export function Layout() {
  const navigate = useNavigate()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const { isAdmin, logout, user } = useAuth()

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
    <main data-id="app-shell" className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgb(135_168_200_/_24%),transparent_32rem),linear-gradient(135deg,rgb(245_233_216_/_50%),transparent_30rem),var(--canvas)] text-[var(--ink)] transition-colors duration-500">
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
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]">
                  <span className="text-sm font-bold text-[var(--on-primary)]">H</span>
                </div>
                <span className="truncate text-base font-bold tracking-tight">
                  Harness<span className="text-[var(--brand-green-deep)]">Studio</span>
                </span>
                <button data-id="sidebar-collapse" className="ml-auto rounded-md p-1.5 transition-colors hover:bg-[var(--surface)]" onClick={() => setSidebarExpanded(false)}>
                  <ArrowLeft size={18} />
                </button>
              </>
            ) : (
              <button data-id="sidebar-expand" className="rounded-md p-2 transition-colors hover:bg-[var(--surface)]" onClick={() => setSidebarExpanded(true)}>
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
                      'relative flex h-11 items-center rounded-sm transition-all duration-200',
                      isActive ? 'bg-[var(--primary)] font-semibold text-[var(--on-primary)]' : 'text-[var(--ink)] hover:bg-[var(--surface)]',
                    )
                  }
                >
                  <div className="flex min-w-12 justify-center">
                    <Icon size={20} />
                  </div>
                  <span className={cn('overflow-hidden whitespace-nowrap text-sm transition-all duration-300', sidebarExpanded ? 'w-40 opacity-100' : 'w-0 opacity-0')}>
                    {item.label}
                  </span>
                </NavLink>
              )
            })}
          </nav>

          <div data-id="sidebar-footer" className="flex flex-col gap-1 border-t border-[var(--hairline-soft)] p-2">
            <button
              data-id="theme-toggle"
              className="flex h-11 w-full items-center rounded-sm text-[var(--ink)] transition-all duration-200 hover:bg-[var(--surface)]"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            >
              <div className="flex min-w-12 justify-center">
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </div>
              <span data-id="theme-label" className={cn('overflow-hidden whitespace-nowrap text-sm transition-all duration-300', sidebarExpanded ? 'w-40 opacity-100' : 'w-0 opacity-0')}>
                {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              </span>
            </button>

            <button
              data-id="logout-button"
              className="flex h-11 w-full items-center rounded-sm text-[var(--ink)] transition-all duration-200 hover:bg-[var(--surface)]"
              onClick={handleLogout}
              title="Logout"
            >
              <div className="flex min-w-12 justify-center">
                <LogOut size={20} />
              </div>
              <span className={cn('overflow-hidden whitespace-nowrap text-sm transition-all duration-300', sidebarExpanded ? 'w-40 opacity-100' : 'w-0 opacity-0')}>
                Logout
              </span>
            </button>

            {sidebarExpanded ? (
              <p data-id="header-current-user" className="truncate px-3 py-2 text-xs text-[var(--steel)]">
                {user?.email}
              </p>
            ) : null}
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
