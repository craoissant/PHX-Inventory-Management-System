
import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { canReviewRequests } from '../lib/requestReview'

const sections = [
  {
    label: 'OVERVIEW',
    items: [
      { label: 'Dashboard', path: '/dashboard', end: true },
    ],
  },
  {
    label: 'INVENTORY',
    items: [
      { label: 'Assets', path: '/assets' },
      { label: 'Kits', path: '/kits' },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { label: 'Checkout', path: '/checkout' },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { label: 'People', path: '/people' },
    ],
  },
]

function Sidebar() {
  const { pimsUser } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <img src="/phx.png" alt="PHX Logo" />
        </div>
      </div>

      <div className="sidebar-system-name">
        <strong>PHX Inventory Management System</strong>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/requests" className="sidebar-primary-link">
          Requests
        </NavLink>
        {canReviewRequests(pimsUser) && (
          <NavLink to="/approvals" className="sidebar-primary-link">
            Approvals
          </NavLink>
        )}
        {sections.map((section) => (
          <div className="sidebar-section" key={section.label}>
            <div className="sidebar-section-label">
              {section.label}
            </div>

            {section.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? 'active' : undefined
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-footer-label">
          PHX INVENTORY
        </span>
        <span className="sidebar-footer-version">
          Version 1.0
        </span>
      </div>
    </aside>
  )
}

export default Sidebar
