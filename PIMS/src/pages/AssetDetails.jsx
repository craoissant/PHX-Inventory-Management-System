import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import './AssetDetails.css'

function formatStatus(status) {
  if (!status) return '—'

  return status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  if (!value) return '—'

  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatPerson(name) {
  return name?.trim() || 'Unassigned'
}

function formatKit(asset) {
  if (!asset.kit_code) return 'Unassigned'
  return `${asset.kit_code}${asset.kit_name ? ` · ${asset.kit_name}` : ''}`
}

export default function AssetDetails() {
  const { assetId } = useParams()
  const navigate = useNavigate()

  const [asset, setAsset] = useState(null)
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadAsset() {
    setLoading(true)
    setError('')

    try {
      const assets = await apiFetch('/api/assets')
      const found = (assets ?? []).find(
        (item) => item.asset_id === assetId
      )

      if (!found) {
        throw new Error('Asset not found.')
      }

      const movementData = await apiFetch(
        `/api/assets/${assetId}/movements`
      )

      setAsset(found)
      setMovements(movementData ?? [])
    } catch (err) {
      console.error('Error loading asset:', err)
      setError(err.message || 'Unable to load asset.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAsset()
  }, [assetId])

  if (loading) {
    return (
      <div className="asset-detail-page">
        <div className="asset-detail-state">Loading asset...</div>
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div className="asset-detail-page">
        <button
          type="button"
          className="asset-detail-back"
          onClick={() => navigate('/assets')}
        >
          ← Back to assets
        </button>

        <div className="asset-detail-state asset-detail-error">
          <strong>Unable to load asset</strong>
          <span>{error || 'Asset not found.'}</span>
          <button type="button" onClick={loadAsset}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="asset-detail-page">
      <button
        type="button"
        className="asset-detail-back"
        onClick={() => navigate('/assets')}
      >
        ← Back to assets
      </button>

      <header className="asset-detail-header">
        <div>
          <p className="asset-detail-eyebrow">INVENTORY / ASSET</p>
          <h1>{asset.name || asset.asset_code}</h1>
          <p className="asset-detail-subtitle">
            {asset.asset_code}
            {asset.make || asset.model
              ? ` · ${[asset.make, asset.model].filter(Boolean).join(' ')}`
              : ''}
          </p>
        </div>

        <span
          className={`asset-detail-status status-${asset.status?.toLowerCase()}`}
        >
          {formatStatus(asset.status)}
        </span>
      </header>

      <section className="asset-detail-grid">
        <div className="asset-detail-card">
          <span>Asset code</span>
          <strong>{asset.asset_code}</strong>
        </div>

        <div className="asset-detail-card">
          <span>Type</span>
          <strong>{asset.asset_type || '—'}</strong>
        </div>

        <div className="asset-detail-card">
          <span>Serial number</span>
          <strong>{asset.serial_number || '—'}</strong>
        </div>

        <div className="asset-detail-card">
          <span>Team</span>
          <strong>
            {asset.team_code
              ? `${asset.team_code}${asset.team_name ? ` · ${asset.team_name}` : ''}`
              : '—'}
          </strong>
        </div>

        <div className="asset-detail-card">
          <span>Kit</span>
          <strong>{formatKit(asset)}</strong>
        </div>

        <div className="asset-detail-card">
          <span>Responsible person</span>
          <strong>{formatPerson(asset.responsible_person_name)}</strong>
        </div>

        <div className="asset-detail-card">
          <span>Current possession</span>
          <strong>{formatPerson(asset.current_possession_name)}</strong>
        </div>

        <div className="asset-detail-card">
          <span>Last updated</span>
          <strong>{formatDate(asset.updated_at)}</strong>
        </div>
      </section>

      {asset.notes && (
        <section className="asset-detail-section">
          <div className="asset-detail-section-heading">
            <div>
              <p className="asset-detail-eyebrow">Notes</p>
              <h2>Asset notes</h2>
            </div>
          </div>
          <div className="asset-detail-notes">
            {asset.notes}
          </div>
        </section>
      )}

      <section className="asset-detail-section">
        <div className="asset-detail-section-heading">
          <div>
            <p className="asset-detail-eyebrow">History</p>
            <h2>Movement history</h2>
          </div>
          <span>{movements.length} recorded</span>
        </div>

        {movements.length === 0 ? (
          <div className="asset-detail-empty">
            No movement history has been recorded for this asset.
          </div>
        ) : (
          <div className="asset-movement-list">
            {movements.map((movement) => (
              <div
                className="asset-movement-row"
                key={movement.movement_id}
              >
                <div>
                  <strong>{formatStatus(movement.movement_type)}</strong>
                  <span>{formatDate(movement.created_at)}</span>
                </div>

                <div className="asset-movement-transition">
                  <span>
                    {formatStatus(movement.from_status)}
                  </span>
                  <span>→</span>
                  <strong>
                    {formatStatus(movement.to_status)}
                  </strong>
                </div>

                {movement.reason && (
                  <span className="asset-movement-reason">
                    {movement.reason}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <Link
        to={`/kits/${asset.kit_id}`}
        className="asset-detail-kit-link"
      >
        View this asset's kit →
      </Link>
    </div>
  )
}
