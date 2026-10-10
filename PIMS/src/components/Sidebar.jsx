import { NavLink } from 'react-router-dom'

const navigation = [
  {
    label: 'Dashboard',
    path: '/dashboard',
  },
  {
    label: 'Assets',
    path: '/assets',
  },
  {
    label: 'Kits',
    path: '/kits',
  },
  {
    label: 'Requests',
    path: '/requests',
  },
  {
    label: 'People',
    path: '/people',
  },
]

function Sidebar() {
  return (
    <aside className="sidebar">

      <div className="sidebar-brand">

        <div className="sidebar-logo">
          PIMS
        </div>

        <div className="sidebar-brand-text">
          <strong>
            PHX Inventory
          </strong>

          <span>
            Management System
          </span>
        </div>

      </div>

      <div className="sidebar-section-label">
        WORKSPACE
      </div>

      <nav className="sidebar-nav">

        {navigation.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              isActive ? 'active' : undefined
            }
          >
            {item.label}
          </NavLink>
        ))}

      </nav>

      <div className="sidebar-footer">

        <span className="sidebar-footer-label">
          PHOTOGRAPHIX
        </span>

        <span className="sidebar-footer-version">
          Internal System
        </span>

      </div>

    </aside>
  )
}

export default Sidebar