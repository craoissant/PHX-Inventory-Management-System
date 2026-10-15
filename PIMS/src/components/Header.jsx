
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/assets': 'Assets',
  '/kits': 'Kits',
  '/checkout': 'Checkout',
  '/requests': 'Requests',
  '/people': 'People',
  '/rls-test': 'RLS Test',
}

function getPageTitle(pathname) {
  if (pageTitles[pathname]) {
    return pageTitles[pathname]
  }

  if (pathname.startsWith('/assets/')) {
    return 'Asset Details'
  }

  if (pathname.startsWith('/kits/')) {
    return 'Kit Details'
  }

  return 'PHX Inventory'
}

function Header() {
  const [person, setPerson] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const menuRef = useRef(null)
  const location = useLocation()

  const pageTitle = getPageTitle(location.pathname)

  useEffect(() => {
    async function loadPerson() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data, error } = await supabase
        .from('people')
        .select(`
          person_id,
          first_name,
          last_name,
          system_role,
          team:teams!people_team_id_fkey (
            team_code
          )
        `)
        .eq('auth_user_id', user.id)
        .eq('active', true)
        .single()

      if (error) {
        console.error('Failed to load header user:', error)
        return
      }

      setPerson(data)
    }

    loadPerson()
  }, [])

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      )
    }
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Logout failed:', error)
    }
  }

  const fullName = person
    ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim()
    : 'User'

  const role = person?.system_role
    ? person.system_role
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase())
    : 'User'

  const initials =
    fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => name.charAt(0).toUpperCase())
      .join('') || 'U'

  const teamCode = person?.team?.team_code

  return (
    <header className="header">
      <div className="header-title">
        <span className="header-system-name">
          PHX Inventory
        </span>

        <span className="header-divider">/</span>

        <span className="header-page-label">
          {pageTitle}
        </span>
      </div>

      <div className="header-user" ref={menuRef}>
        <div className="header-user-info">
          <strong>{fullName}</strong>

          <span>
            {teamCode ? `${teamCode} · ` : ''}
            {role}
          </span>
        </div>

        <button
          className="header-user-avatar"
          onClick={() => setMenuOpen((open) => !open)}
          title="Account menu"
          aria-label="Open account menu"
          aria-expanded={menuOpen}
          type="button"
        >
          {initials}
        </button>

        {menuOpen && (
          <div className="header-account-menu">
            <div className="header-account-details">
              <strong>{fullName}</strong>

              <span>
                {teamCode ? `${teamCode} · ` : ''}
                {role}
              </span>
            </div>

            <div className="header-account-divider" />

            <button
              className="header-logout-button"
              onClick={handleLogout}
              type="button"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

export default Header
