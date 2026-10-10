import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import RLSTest from './pages/RLSTest'
import AppLayout from './layouts/AppLayout'

import Dashboard from './pages/Dashboard'
import Assets from './pages/Assets'
import AssetDetails from './pages/AssetDetails'
import Kits from './pages/Kits'
import Requests from './pages/Requests'
import People from './pages/People'
import Login from './pages/Login'
import KitDetail from './pages/KitDetails'

function ProtectedRoute() {
  const { user, loading } = useAuth()

  // Wait until Supabase has checked whether a session exists
  if (loading) {
    return null
  }

  // Not logged in → Login
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Logged in → allow access
  return <Outlet />
}

function LoginRoute() {
  const { user, loading } = useAuth()

  // Wait for Supabase session check
  if (loading) {
    return null
  }

  // Already logged in → Dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return <Login />
}

function App() {
  return (
    <Routes>
      {/* Login */}
      <Route path="/login" element={<LoginRoute />} />

      {/* Protected application */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/rls-test" element={<RLSTest />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/assets/:assetId" element={<AssetDetails />} />
          <Route path="/kits" element={<Kits />} />
          <Route path="/kits/:kitId" element={<KitDetail />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/people" element={<People />} />
        </Route>
      </Route>

      {/* Root */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App