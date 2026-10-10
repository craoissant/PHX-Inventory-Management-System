import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'

function formatStatus(status) {
  if (!status) return '—'

  return status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatPerson(person) {
  if (!person) return 'Unassigned'

  return `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() ||
    'Unassigned'
}

function formatTeam(team) {
  if (!team) return '—'

  return team.team_name || team.team_code || '—'
}

function formatMakeModel(asset) {
  return [asset.make, asset.model]
    .filter(Boolean)
    .join(' ') || '—'
}

function KitDetail() {
  const { kitId } = useParams()
  const navigate = useNavigate()

  const [kit, setKit] = useState(null)
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadKit()
  }, [kitId])

  async function loadKit() {
    setLoading(true)
    setError('')

    try {
      const data = await apiFetch(`/api/kits/${kitId}`)

      setKit({
        ...data,
        team: {
          team_id: data.team_id,
          team_code: data.team_code,
          team_name: data.team_name,
        },
        assigned_person: data.assigned_person_id
          ? {
              person_id: data.assigned_person_id,
              first_name: data.assigned_person_name?.split(' ')[0] ?? '',
              last_name: data.assigned_person_name?.split(' ').slice(1).join(' ') ?? '',
            }
          : null,
      })

      setAssets(
        (data.assets ?? []).map((asset) => ({
          ...asset,
          responsible_person: asset.responsible_person_id
            ? {
                person_id: asset.responsible_person_id,
                first_name: asset.responsible_person_name?.split(' ')[0] ?? '',
                last_name: asset.responsible_person_name?.split(' ').slice(1).join(' ') ?? '',
              }
            : null,
          current_possession: asset.current_possession_id
            ? {
                person_id: asset.current_possession_id,
                first_name: asset.current_possession_name?.split(' ')[0] ?? '',
                last_name: asset.current_possession_name?.split(' ').slice(1).join(' ') ?? '',
              }
            : null,
        }))
      )
    } catch (error) {
      console.error('Error loading kit:', error)
      setError(error.message || 'Unable to load kit.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="kits-page">
        <div className="kits-state">
          Loading kit...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="kits-page">
        <div className="kits-state kits-error">
          <strong>Unable to load kit</strong>

          <span>{error}</span>

          <button
            type="button"
            onClick={() => navigate('/kits')}
          >
            Back to kits
          </button>
        </div>
      </div>
    )
  }

  if (!kit) {
    return null
  }

  const assignedPerson = formatPerson(
    kit.assigned_person
  )

  const statusCounts = assets.reduce(
    (counts, asset) => {
      if (asset.status) {
        counts[asset.status] =
          (counts[asset.status] || 0) + 1
      }

      return counts
    },
    {}
  )

  return (
    <div className="kit-detail-page">

      <button
        type="button"
        className="kit-detail-back"
        onClick={() => navigate('/kits')}
      >
        ← Back to kits
      </button>

      <div className="kit-detail-header">

        <div>
          <div className="kits-eyebrow">
            {kit.team?.team_code || '—'} / KIT
          </div>

          <h2>{kit.kit_name}</h2>

          <p>
            {kit.kit_code} ·{' '}
            {kit.is_general
              ? 'General kit'
              : 'Individual kit'}
          </p>
        </div>

        <span
          className={`kit-status ${
            kit.active ? 'active' : 'inactive'
          }`}
        >
          {kit.active ? 'Active' : 'Inactive'}
        </span>

      </div>

      <div className="kit-detail-summary">

        <div>
          <span>Responsible Person</span>
          <strong>{assignedPerson}</strong>
        </div>

        <div>
          <span>Team</span>
          <strong>
            {formatTeam(kit.team)}
          </strong>
        </div>

        <div>
          <span>Assets</span>
          <strong>{assets.length}</strong>
        </div>

      </div>

      {assets.length > 0 && (
        <div className="kit-detail-status-summary">

          <div>
            <span>Available</span>
            <strong>
              {statusCounts.AVAILABLE || 0}
            </strong>
          </div>

          <div>
            <span>Checked Out</span>
            <strong>
              {statusCounts.CHECKED_OUT || 0}
            </strong>
          </div>

          <div>
            <span>Borrowed</span>
            <strong>
              {statusCounts.BORROWED || 0}
            </strong>
          </div>

          <div>
            <span>Attention</span>
            <strong>
              {(statusCounts.DAMAGED || 0) +
                (statusCounts.MISSING || 0) +
                (statusCounts.LOST || 0) +
                (statusCounts.IN_SERVICE || 0)}
            </strong>
          </div>

        </div>
      )}

      <div className="kit-assets-header">

        <div>
          <h3>Assets</h3>

          <p>
            Equipment currently associated with this kit.
          </p>
        </div>

        <button
          type="button"
          className="kits-refresh"
          onClick={loadKit}
        >
          Refresh
        </button>

      </div>

      <div className="kit-assets-table-wrapper">

        <table className="kit-assets-table">

          <thead>
            <tr>
              <th>Asset Code</th>
              <th>Asset</th>
              <th>Make / Model</th>
              <th>Type</th>
              <th>Status</th>
              <th>Responsible Person</th>
              <th>Current Possession</th>
            </tr>
          </thead>

          <tbody>

            {assets.map((asset) => (
              <tr key={asset.asset_id}>

                <td>
                  <Link
                    to={`/assets/${asset.asset_id}`}
                    className="asset-code-button"
                  >
                    {asset.asset_code}
                  </Link>
                </td>

                <td>
                  <strong>
                    {asset.name || '—'}
                  </strong>
                </td>

                <td>
                  {formatMakeModel(asset)}
                </td>

                <td>
                  {asset.asset_type || '—'}
                </td>

                <td>
                  <span
                    className={`asset-status asset-status-${asset.status?.toLowerCase()}`}
                  >
                    {formatStatus(asset.status)}
                  </span>
                </td>

                <td>
                  {formatPerson(
                    asset.responsible_person
                  )}
                </td>

                <td>
                  {formatPerson(
                    asset.current_possession
                  )}
                </td>

              </tr>
            ))}

          </tbody>

        </table>

        {assets.length === 0 && (
          <div className="kit-empty-assets">
            <strong>No assets in this kit</strong>

            <span>
              No assets are currently associated
              with this kit.
            </span>
          </div>
        )}

      </div>

    </div>
  )
}

export default KitDetail