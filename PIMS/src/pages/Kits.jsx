import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import { useNavigate } from 'react-router-dom'

function formatPerson(personName) {
  return personName?.trim() || 'Unassigned'
}

function formatTeam(team) {
  if (!team) return '—'

  return team.team_code || team.team_name || '—'
}

function Kits() {
  const navigate = useNavigate()

  const [kits, setKits] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadKits()
  }, [])

  async function loadKits() {
  setLoading(true)
  setError('')

  try {
    const data = await apiFetch('/api/kits')

    setKits(data ?? [])
  } catch (error) {
    console.error('Error loading kits:', error)
    setError(error.message)
  } finally {
    setLoading(false)
  }
}
  const filteredKits = useMemo(() => {
    if (filter === 'ALL') {
      return kits
    }

    return kits.filter(
      (kit) => kit.team_code === filter
    )
  }, [kits, filter])

  const totalAssets = useMemo(() => {
    return filteredKits.reduce(
      (total, kit) => total + kit.asset_count,
      0
    )
  }, [filteredKits])

  const generalKits = filteredKits.filter(
    (kit) => kit.is_general
  ).length

  const individualKits = filteredKits.filter(
    (kit) => !kit.is_general
  ).length

  if (loading) {
    return (
      <div className="kits-page">
        <div className="kits-header">
          <div>
            <h2>Kits</h2>
            <p>
              Equipment grouped by operational kit.
            </p>
          </div>
        </div>

        <div className="kits-state">
          Loading kits...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="kits-page">
        <div className="kits-header">
          <div>
            <h2>Kits</h2>
            <p>
              Equipment grouped by operational kit.
            </p>
          </div>
        </div>

        <div className="kits-state kits-error">
          <strong>Unable to load kits</strong>

          <span>{error}</span>

          <button
            type="button"
            onClick={loadKits}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="kits-page">

      <div className="kits-header">
        <div>
          <div className="kits-eyebrow">
            REGISTER
          </div>

          <h2>Kits</h2>

          <p>
            Equipment grouped by operational kit.
          </p>
        </div>

        <button
          type="button"
          className="kits-refresh"
          onClick={loadKits}
        >
          Refresh
        </button>
      </div>

      <div className="kits-summary">

        <div className="kits-summary-item">
          <span>Kits</span>
          <strong>{filteredKits.length}</strong>
        </div>

        <div className="kits-summary-item">
          <span>Assets</span>
          <strong>{totalAssets}</strong>
        </div>

        <div className="kits-summary-item">
          <span>Individual</span>
          <strong>{individualKits}</strong>
        </div>

        <div className="kits-summary-item">
          <span>General</span>
          <strong>{generalKits}</strong>
        </div>

      </div>

      <div className="kits-toolbar">

        <div className="kits-filters">

          <button
            type="button"
            className={filter === 'ALL' ? 'active' : ''}
            onClick={() => setFilter('ALL')}
          >
            All
          </button>

          <button
            type="button"
            className={filter === 'PHX' ? 'active' : ''}
            onClick={() => setFilter('PHX')}
          >
            PHX
          </button>

          <button
            type="button"
            className={filter === 'MGX' ? 'active' : ''}
            onClick={() => setFilter('MGX')}
          >
            MGX
          </button>

        </div>

      </div>

      {filteredKits.length === 0 ? (
        <div className="kits-state">
          <strong>No kits found</strong>

          <span>
            There are no active kits for this filter.
          </span>

          {filter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setFilter('ALL')}
            >
              Show all kits
            </button>
          )}
        </div>
      ) : (
        <div className="kits-grid">

          {filteredKits.map((kit) => (
            <div
              className="kit-card"
              key={kit.kit_id}
            >

              <div className="kit-card-top">

                <div>
                  <span className="kit-code">
                    {kit.kit_code}
                  </span>

                  <h3>{kit.kit_name}</h3>
                </div>

                <span
                  className={`kit-status ${
                    kit.active
                      ? 'active'
                      : 'inactive'
                  }`}
                >
                  {kit.active
                    ? 'Active'
                    : 'Inactive'}
                </span>

              </div>

              <div className="kit-card-details">

                <div>
                  <span>Team</span>

                  <strong>
                    {formatTeam({
                      team_code: kit.team_code,
                      team_name: kit.team_name,
                    })}
                  </strong>
                </div>

                <div>
                  <span>Responsible Person</span>

                  <strong>
                    {formatPerson(kit.assigned_person_name)}
                  </strong>
                </div>

                <div>
                  <span>Kit Type</span>

                  <strong>
                    {kit.is_general
                      ? 'General'
                      : 'Individual'}
                  </strong>
                </div>

              </div>

              <div className="kit-card-footer">

                <div>
                  <strong>
                    {kit.asset_count}
                  </strong>

                  <span>
                    {kit.asset_count === 1
                      ? 'asset'
                      : 'assets'}
                  </span>
                </div>

                <button
                  type="button"
                  className="kit-view-button"
                  onClick={() =>
                    navigate(
                      `/kits/${kit.kit_id}`
                    )
                  }
                >
                  View assets →
                </button>

              </div>

            </div>
          ))}

        </div>
      )}

    </div>
  )
}

export default Kits