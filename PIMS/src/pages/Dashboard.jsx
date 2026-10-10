import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STATUS_ORDER = [
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
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatPerson(person) {
  if (!person) return 'Unknown'

  return (
    `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() ||
    'Unknown'
  )
}

function formatDate(value) {
  if (!value) return '—'

  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function getStatusClass(status) {
  if (!status) return ''

  return `dashboard-status dashboard-status-${status.toLowerCase()}`
}

function getMovementLabel(movement) {
  if (!movement?.movement_type) {
    return 'Movement'
  }

  return formatStatus(movement.movement_type)
}

function getMovementDescription(movement) {
  switch (movement.movement_type) {
    case 'HANDOVER':
      return `${formatPerson(
        movement.from_possession
      )} → ${formatPerson(
        movement.to_possession
      )}`

    case 'KIT_TRANSFER':
      return `${movement.from_kit?.kit_code || '—'} → ${
        movement.to_kit?.kit_code || '—'
      }`

    case 'STATUS_CHANGE':
      return `${formatStatus(
        movement.from_status
      )} → ${formatStatus(
        movement.to_status
      )}`

    case 'ASSIGNMENT':
      return 'Asset assignment'

    case 'NOTE':
      return movement.notes || 'Asset note'

    default:
      return 'Asset movement'
  }
}

export default function Dashboard() {
  const [assets, setAssets] = useState([])
  const [kits, setKits] = useState([])
  const [requests, setRequests] = useState([])
  const [movements, setMovements] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  async function loadDashboard() {
    try {
      setError('')

      const [
        assetsResult,
        kitsResult,
        requestsResult,
        movementsResult,
      ] = await Promise.all([
        supabase
          .from('assets')
          .select(`
            asset_id,
            asset_code,
            name,
            make,
            model,
            asset_type,
            status,
            team_id,
            kit_id,
            responsible_person_id,
            current_possession_id
          `)
          .order('asset_code', {
            ascending: true,
          }),

        supabase
          .from('kits')
          .select(`
            kit_id,
            kit_code,
            kit_name,
            team_id,
            assigned_person_id,
            is_general,
            active,
            team:teams!kits_team_id_fkey (
              team_id,
              team_code,
              team_name
            ),
            assigned_person:people!kits_assigned_person_id_fkey (
              person_id,
              first_name,
              last_name
            )
          `)
          .eq('active', true)
          .order('kit_code', {
            ascending: true,
          }),

        supabase
          .from('requests')
          .select(`
            request_id,
            requested_by,
            status,
            purpose,
            created_at,
            needed_from,
            needed_until,
            requester:people!requests_requested_by_fkey (
              person_id,
              first_name,
              last_name
            )
          `)
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('asset_movements')
          .select(`
            movement_id,
            asset_id,
            movement_type,
            from_kit_id,
            to_kit_id,
            from_possession_id,
            to_possession_id,
            from_status,
            to_status,
            reason,
            performed_by,
            notes,
            created_at,

            asset:assets!asset_movements_asset_id_fkey (
              asset_id,
              asset_code,
              name,
              make,
              model
            ),

            from_kit:kits!asset_movements_from_kit_id_fkey (
              kit_id,
              kit_code
            ),

            to_kit:kits!asset_movements_to_kit_id_fkey (
              kit_id,
              kit_code
            ),

            from_possession:people!asset_movements_from_possession_id_fkey (
              person_id,
              first_name,
              last_name
            ),

            to_possession:people!asset_movements_to_possession_id_fkey (
              person_id,
              first_name,
              last_name
            ),

            performed_by_person:people!asset_movements_performed_by_fkey (
              person_id,
              first_name,
              last_name
            )
          `)
          .order('created_at', {
            ascending: false,
          })
          .limit(10),
      ])

      if (assetsResult.error) {
        throw assetsResult.error
      }

      if (kitsResult.error) {
        throw kitsResult.error
      }

      if (requestsResult.error) {
        throw requestsResult.error
      }

      if (movementsResult.error) {
        throw movementsResult.error
      }

      setAssets(assetsResult.data ?? [])
      setKits(kitsResult.data ?? [])
      setRequests(requestsResult.data ?? [])
      setMovements(movementsResult.data ?? [])
    } catch (loadError) {
      console.error(
        'Error loading dashboard:',
        loadError
      )

      setError(
        loadError.message ||
          'Failed to load dashboard.'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  function handleRefresh() {
    setRefreshing(true)
    loadDashboard()
  }

  const totalAssets = assets.length

  const statusCounts = STATUS_ORDER.reduce(
    (counts, status) => {
      counts[status] = assets.filter(
        (asset) => asset.status === status
      ).length

      return counts
    },
    {}
  )

  const attentionCount =
    (statusCounts.DAMAGED || 0) +
    (statusCounts.MISSING || 0) +
    (statusCounts.LOST || 0) +
    (statusCounts.IN_SERVICE || 0)

  const phxAssets = assets.filter(
    (asset) =>
      kits.some(
        (kit) =>
          kit.team?.team_code === 'PHX' &&
          kit.kit_id === asset.kit_id
      )
  ).length

  const mgxAssets = assets.filter(
    (asset) =>
      kits.some(
        (kit) =>
          kit.team?.team_code === 'MGX' &&
          kit.kit_id === asset.kit_id
      )
  ).length

  const pendingRequests = requests.filter(
    (request) =>
      request.status === 'PENDING'
  )

  const approvedRequests = requests.filter(
    (request) =>
      request.status === 'APPROVED'
  )

  const activeKits = kits.length

  const generalKits = kits.filter(
    (kit) => kit.is_general
  ).length

  const individualKits = kits.filter(
    (kit) => !kit.is_general
  ).length

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-state">
          Loading dashboard...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-state dashboard-error">
          <strong>
            Unable to load dashboard
          </strong>

          <span>{error}</span>

          <button
            type="button"
            onClick={handleRefresh}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-page">

      <div className="dashboard-header">

        <div>
          <p className="dashboard-eyebrow">
            PHX INVENTORY MANAGEMENT SYSTEM
          </p>

          <h1>Dashboard</h1>

          <p className="dashboard-subtitle">
            Current inventory, operational status,
            and recent activity.
          </p>
        </div>

        <button
          type="button"
          className="dashboard-refresh"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing
            ? 'Refreshing...'
            : 'Refresh'}
        </button>

      </div>

      <div className="dashboard-stat-grid">

        <div className="dashboard-stat-card">
          <span>Total Assets</span>
          <strong>{totalAssets}</strong>
        </div>

        <div className="dashboard-stat-card">
          <span>Available</span>
          <strong>
            {statusCounts.AVAILABLE || 0}
          </strong>
        </div>

        <div className="dashboard-stat-card">
          <span>Checked Out</span>
          <strong>
            {statusCounts.CHECKED_OUT || 0}
          </strong>
        </div>

        <div className="dashboard-stat-card">
          <span>Borrowed</span>
          <strong>
            {statusCounts.BORROWED || 0}
          </strong>
        </div>

        <div className="dashboard-stat-card dashboard-stat-attention">
          <span>Attention</span>
          <strong>{attentionCount}</strong>
        </div>

      </div>

      <div className="dashboard-grid">

        <section className="dashboard-card">

          <div className="dashboard-card-header">

            <div>
              <p className="dashboard-card-eyebrow">
                INVENTORY
              </p>

              <h2>Status Overview</h2>
            </div>

            <Link to="/assets">
              View Assets
            </Link>

          </div>

          <div className="dashboard-status-list">

            {STATUS_ORDER.map((status) => (
              <div
                key={status}
                className="dashboard-status-row"
              >

                <span>
                  {formatStatus(status)}
                </span>

                <strong>
                  {statusCounts[status] || 0}
                </strong>

              </div>
            ))}

          </div>

        </section>

        <section className="dashboard-card">

          <div className="dashboard-card-header">

            <div>
              <p className="dashboard-card-eyebrow">
                TEAMS
              </p>

              <h2>Inventory Distribution</h2>
            </div>

            <Link to="/kits">
              View Kits
            </Link>

          </div>

          <div className="dashboard-team-list">

            <div className="dashboard-team-row">

              <div>
                <strong>PHX</strong>
                <span>Photographix</span>
              </div>

              <strong>{phxAssets}</strong>

            </div>

            <div className="dashboard-team-row">

              <div>
                <strong>MGX</strong>
                <span>Motiongraphix</span>
              </div>

              <strong>{mgxAssets}</strong>

            </div>

          </div>

          <div className="dashboard-kit-summary">

            <div>
              <span>Active Kits</span>
              <strong>{activeKits}</strong>
            </div>

            <div>
              <span>Individual</span>
              <strong>{individualKits}</strong>
            </div>

            <div>
              <span>General</span>
              <strong>{generalKits}</strong>
            </div>

          </div>

        </section>

        <section className="dashboard-card dashboard-card-wide">

          <div className="dashboard-card-header">

            <div>
              <p className="dashboard-card-eyebrow">
                REQUESTS
              </p>

              <h2>Request Queue</h2>
            </div>

            <Link to="/requests">
              View Requests
            </Link>

          </div>

          <div className="dashboard-request-summary">

            <div>
              <span>Pending</span>
              <strong>
                {pendingRequests.length}
              </strong>
            </div>

            <div>
              <span>Approved</span>
              <strong>
                {approvedRequests.length}
              </strong>
            </div>

            <div>
              <span>Total Requests</span>
              <strong>
                {requests.length}
              </strong>
            </div>

          </div>

          {pendingRequests.length === 0 ? (
            <div className="dashboard-empty">
              No pending requests.
            </div>
          ) : (
            <div className="dashboard-request-list">

              {pendingRequests
                .slice(0, 5)
                .map((request) => (
                  <div
                    key={request.request_id}
                    className="dashboard-request-row"
                  >

                    <div>
                      <strong>
                        Request #
                        {request.request_id.slice(
                          0,
                          8
                        )}
                      </strong>

                      <span>
                        {formatPerson(
                          request.requester
                        )}
                      </span>
                    </div>

                    <div>
                      <span>
                        {request.purpose ||
                          'No purpose provided'}
                      </span>

                      <small>
                        {formatDate(
                          request.created_at
                        )}
                      </small>
                    </div>

                  </div>
                ))}

            </div>
          )}

        </section>

        <section className="dashboard-card dashboard-card-wide">

          <div className="dashboard-card-header">

            <div>
              <p className="dashboard-card-eyebrow">
                ACTIVITY
              </p>

              <h2>Recent Movements</h2>
            </div>

            <Link to="/assets">
              Inventory
            </Link>

          </div>

          {movements.length === 0 ? (
            <div className="dashboard-empty">
              No asset movements recorded yet.
            </div>
          ) : (
            <div className="dashboard-movement-list">

              {movements.map((movement) => (
                <div
                  key={movement.movement_id}
                  className="dashboard-movement-row"
                >

                  <div className="dashboard-movement-main">

                    <strong>
                      {movement.asset?.asset_code ||
                        'Unknown asset'}
                    </strong>

                    <span>
                      {movement.asset?.name ||
                        'Unknown asset'}
                    </span>

                  </div>

                  <div className="dashboard-movement-action">

                    <strong>
                      {getMovementLabel(
                        movement
                      )}
                    </strong>

                    <span>
                      {getMovementDescription(
                        movement
                      )}
                    </span>

                  </div>

                  <div className="dashboard-movement-meta">

                    <span>
                      {formatPerson(
                        movement.performed_by_person
                      )}
                    </span>

                    <small>
                      {formatDate(
                        movement.created_at
                      )}
                    </small>

                  </div>

                </div>
              ))}

            </div>
          )}

        </section>

      </div>

    </div>
  )
}