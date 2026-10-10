import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import './Assets.css'

const STATUS_OPTIONS = [
  'AVAILABLE',
  'CHECKED_OUT',
  'BORROWED',
  'IN_SERVICE',
  'DAMAGED',
  'MISSING',
  'LOST',
  'RETIRED',
]

function formatStatus(status) {
  if (!status) return '—'

  return status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatTeam(team) {
  if (!team) return '—'

  if (team.team_code && team.team_name) {
    return `${team.team_code} · ${team.team_name}`
  }

  return team.team_code || team.team_name || '—'
}

function formatKit(kit) {
  if (!kit) return '—'

  if (kit.kit_code && kit.kit_name) {
    return `${kit.kit_code} · ${kit.kit_name}`
  }

  return kit.kit_code || kit.kit_name || '—'
}

function Assets() {
  const navigate = useNavigate()

  const [assets, setAssets] = useState([])
  const [teams, setTeams] = useState([])
  const [kits, setKits] = useState([])

  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [kitFilter, setKitFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [sortField, setSortField] = useState('asset_code')
  const [sortDirection, setSortDirection] = useState('asc')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
  setLoading(true)
  setError(null)

  try {
    const [assetData, kitData] = await Promise.all([
      apiFetch('/api/assets'),
      apiFetch('/api/kits'),
    ])

    const uniqueTeams = Array.from(
      new Map(
        assetData
          .filter((asset) => asset.team_id)
          .map((asset) => [
            asset.team_id,
            {
              team_id: asset.team_id,
              team_code: asset.team_code,
              team_name: asset.team_name,
            },
          ])
      ).values()
    ).sort((a, b) =>
      a.team_code.localeCompare(b.team_code)
    )

    setAssets(assetData ?? [])
    setTeams(uniqueTeams)
    setKits(kitData ?? [])
  } catch (error) {
    console.error('Error fetching assets:', error)
    setError(error.message)
  } finally {
    setLoading(false)
  }
}

    fetchData()
  }, [])

  const assetTypes = useMemo(() => {
    return [
      ...new Set(
        assets
          .map((asset) => asset.asset_type)
          .filter(Boolean)
      ),
    ].sort((a, b) =>
      a.localeCompare(b, undefined, {
        sensitivity: 'base',
      })
    )
  }, [assets])

  const filteredAssets = useMemo(() => {
    const searchTerm = search.toLowerCase().trim()

    return assets.filter((asset) => {
      const searchableValues = [
        asset.asset_code,
        asset.name,
        asset.make,
        asset.model,
        asset.serial_number,
        asset.asset_type,
      ]

      const matchesSearch =
        !searchTerm ||
        searchableValues.some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(searchTerm)
        )

      const matchesTeam =
        teamFilter === 'ALL' ||
        asset.team_id === teamFilter

      const matchesKit =
        kitFilter === 'ALL' ||
        asset.kit_id === kitFilter

      const matchesType =
        typeFilter === 'ALL' ||
        asset.asset_type === typeFilter

      const matchesStatus =
        statusFilter === 'ALL' ||
        asset.status === statusFilter

      return (
        matchesSearch &&
        matchesTeam &&
        matchesKit &&
        matchesType &&
        matchesStatus
      )
    })
  }, [
    assets,
    search,
    teamFilter,
    kitFilter,
    typeFilter,
    statusFilter,
  ])

  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((a, b) => {
      const aValue = a[sortField] ?? ''
      const bValue = b[sortField] ?? ''

      const comparison = String(aValue).localeCompare(
        String(bValue),
        undefined,
        {
          numeric: true,
          sensitivity: 'base',
        }
      )

      return sortDirection === 'asc'
        ? comparison
        : -comparison
    })
  }, [
    filteredAssets,
    sortField,
    sortDirection,
  ])

  const activeFilterCount = [
    search.trim() !== '',
    teamFilter !== 'ALL',
    kitFilter !== 'ALL',
    typeFilter !== 'ALL',
    statusFilter !== 'ALL',
  ].filter(Boolean).length

  const hasFilters = activeFilterCount > 0

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection((current) =>
        current === 'asc' ? 'desc' : 'asc'
      )
      return
    }

    setSortField(field)
    setSortDirection('asc')
  }

  function sortIndicator(field) {
    if (sortField !== field) {
      return '↕'
    }

    return sortDirection === 'asc'
      ? '↑'
      : '↓'
  }

  function clearFilters() {
    setSearch('')
    setTeamFilter('ALL')
    setKitFilter('ALL')
    setTypeFilter('ALL')
    setStatusFilter('ALL')
  }

  function handleRowKeyDown(event, assetId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigate(`/assets/${assetId}`)
    }
  }

  if (loading) {
    return (
      <div className="assets-page">
        <div className="assets-loading">
          Loading assets...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="assets-page">
        <div className="assets-error">
          <h2>Unable to load assets</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="assets-page">

      <div className="assets-header">
        <div>
          <p className="page-eyebrow">INVENTORY</p>

          <h1>Assets</h1>

          <p className="page-description">
            View and manage equipment across PHX.
          </p>
        </div>

        <div className="asset-count">
          <span>{assets.length}</span>
          <small>Total Assets</small>
        </div>
      </div>

      <div className="assets-filters">

        <div className="search-wrapper">
          <span className="search-icon" aria-hidden="true">
            ⌕
          </span>

          <input
            type="search"
            placeholder="Search by code, name, make, model or serial number..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            aria-label="Search assets"
          />
        </div>

        <div className="filter-row">

          <select
            value={teamFilter}
            onChange={(event) =>
              setTeamFilter(event.target.value)
            }
            aria-label="Filter by team"
          >
            <option value="ALL">All teams</option>

            {teams.map((team) => (
              <option
                key={team.team_id}
                value={team.team_id}
              >
                {formatTeam(team)}
              </option>
            ))}
          </select>

          <select
            value={kitFilter}
            onChange={(event) =>
              setKitFilter(event.target.value)
            }
            aria-label="Filter by kit"
          >
            <option value="ALL">All kits</option>

            {kits.map((kit) => (
              <option
                key={kit.kit_id}
                value={kit.kit_id}
              >
                {formatKit(kit)}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value)
            }
            aria-label="Filter by asset type"
          >
            <option value="ALL">All asset types</option>

            {assetTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>

            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              type="button"
              className="clear-filters"
              onClick={clearFilters}
            >
              Clear
              {activeFilterCount > 1
                ? ` (${activeFilterCount})`
                : ''}
            </button>
          )}

        </div>
      </div>

      <div className="assets-results">
        Showing {sortedAssets.length} of {assets.length} assets
      </div>

      <div className="assets-table-container">

        <table className="assets-table">

          <thead>
            <tr>

              <th
                scope="col"
                className="sortable-header"
                onClick={() => handleSort('asset_code')}
              >
                Asset Code
                <span aria-hidden="true">
                  {sortIndicator('asset_code')}
                </span>
              </th>

              <th
                scope="col"
                className="sortable-header"
                onClick={() => handleSort('name')}
              >
                Asset
                <span aria-hidden="true">
                  {sortIndicator('name')}
                </span>
              </th>

              <th
                scope="col"
                className="sortable-header"
                onClick={() => handleSort('make')}
              >
                Make
                <span aria-hidden="true">
                  {sortIndicator('make')}
                </span>
              </th>

              <th
                scope="col"
                className="sortable-header"
                onClick={() => handleSort('model')}
              >
                Model
                <span aria-hidden="true">
                  {sortIndicator('model')}
                </span>
              </th>

              <th
                scope="col"
                className="sortable-header"
                onClick={() => handleSort('asset_type')}
              >
                Type
                <span aria-hidden="true">
                  {sortIndicator('asset_type')}
                </span>
              </th>

              <th
                scope="col"
                className="sortable-header"
                onClick={() => handleSort('status')}
              >
                Status
                <span aria-hidden="true">
                  {sortIndicator('status')}
                </span>
              </th>

            </tr>
          </thead>

          <tbody>

            {sortedAssets.length === 0 ? (
              <tr>
                <td colSpan="6">

                  <div className="empty-state">
                    <h3>No assets found</h3>

                    <p>
                      Try changing your search or filters.
                    </p>

                    {hasFilters && (
                      <button
                        type="button"
                        className="clear-filters"
                        onClick={clearFilters}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                </td>
              </tr>
            ) : (

              sortedAssets.map((asset) => (
                <tr
                  key={asset.asset_id}
                  className="asset-row"
                  onClick={() =>
                    navigate(`/assets/${asset.asset_id}`)
                  }
                  onKeyDown={(event) =>
                    handleRowKeyDown(event, asset.asset_id)
                  }
                  tabIndex="0"
                  role="link"
                  aria-label={`Open ${asset.asset_code} ${asset.name}`}
                >

                  <td>
                    <span className="asset-code">
                      {asset.asset_code}
                    </span>
                  </td>

                  <td>
                    <strong>{asset.name || '—'}</strong>
                  </td>

                  <td>
                    {asset.make || '—'}
                  </td>

                  <td>
                    {asset.model || '—'}
                  </td>

                  <td>
                    {asset.asset_type || '—'}
                  </td>

                  <td>
                    <span
                      className={`status-badge status-${asset.status?.toLowerCase()}`}
                    >
                      {formatStatus(asset.status)}
                    </span>
                  </td>

                </tr>
              ))

            )}

          </tbody>

        </table>

      </div>

    </div>
  )
}

export default Assets