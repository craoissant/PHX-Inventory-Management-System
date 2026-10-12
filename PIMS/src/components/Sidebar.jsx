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
  { label: 'Checkout', 
    path: '/checkout' 
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
       <img src="/phx.png" alt="PHX Logo" />
       </div>

      </div>
    
      <div> <strong>
        PHX Inventory Management System
        </strong>
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