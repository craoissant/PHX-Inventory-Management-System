
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import './Checkout.css'

const MANAGEMENT_ROLES = ['MANAGER', 'ADMIN', 'DEVELOPER']

function Checkout() {
  const [currentPerson, setCurrentPerson] = useState(null)
  const [assets, setAssets] = useState([])
  const [kits, setKits] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [selectedKit, setSelectedKit] = useState('ALL')
  const [selectedAssets, setSelectedAssets] = useState([])
  const [notes, setNotes] = useState('')
  const [mode, setMode] = useState('CHECKOUT')

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const [me, assetData, kitData] = await Promise.all([
        apiFetch('/api/auth/me'),
        apiFetch('/api/assets'),
        apiFetch('/api/kits'),
      ])

      setCurrentPerson(me)
      setAssets(assetData)
      setKits(kitData)
    } catch (err) {
      setError(err.message || 'Failed to load asset data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const isManager = currentPerson?.system_role === 'MANAGER'

  const hasManagementAccess = MANAGEMENT_ROLES.includes(
    currentPerson?.system_role,
  )

  const visibleKits = useMemo(() => {
    if (!hasManagementAccess) return []

    if (isManager) {
      return kits.filter(
        (kit) =>
          String(kit.assigned_person_id) ===
          String(currentPerson?.person_id),
      )
    }

    return kits
  }, [kits, currentPerson, isManager, hasManagementAccess])

  const visibleAssets = useMemo(() => {
    if (!currentPerson) return []

    return assets.filter((asset) => {
      const requiredStatus =
        mode === 'CHECKOUT' ? 'AVAILABLE' : 'CHECKED_OUT'

      if (asset.status !== requiredStatus) return false

      if (isManager) {
        return (
          String(asset.responsible_person_id) ===
            String(currentPerson.person_id) &&
          visibleKits.some(
            (kit) => String(kit.kit_id) === String(asset.kit_id),
          )
        )
      }

      if (!hasManagementAccess) return false

      if (
        selectedKit !== 'ALL' &&
        String(asset.kit_id) !== String(selectedKit)
      ) {
        return false
      }

      return true
    })
  }, [
    assets,
    currentPerson,
    isManager,
    hasManagementAccess,
    visibleKits,
    selectedKit,
    mode,
  ])

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return visibleAssets

    return visibleAssets.filter((asset) =>
      [
        asset.asset_code,
        asset.name,
        asset.make,
        asset.model,
        asset.serial_number,
        asset.kit_code,
        asset.kit_name,
      ].some((value) =>
        String(value || '').toLowerCase().includes(query),
      ),
    )
  }, [visibleAssets, search])

  const selectedVisibleCount = filteredAssets.filter((asset) =>
    selectedAssets.includes(asset.asset_id),
  ).length

  function toggleAsset(assetId) {
    setSelectedAssets((previous) =>
      previous.includes(assetId)
        ? previous.filter((id) => id !== assetId)
        : [...previous, assetId],
    )

    setSuccess('')
    setError('')
  }

  function toggleAllVisible() {
    const visibleIds = filteredAssets.map((asset) => asset.asset_id)

    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedAssets.includes(id))

    setSelectedAssets((previous) =>
      allSelected
        ? previous.filter((id) => !visibleIds.includes(id))
        : [...new Set([...previous, ...visibleIds])],
    )

    setSuccess('')
    setError('')
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setSelectedAssets([])
    setNotes('')
    setError('')
    setSuccess('')
  }

  async function handleCheckout() {
    if (selectedAssets.length === 0) {
      setError('Select at least one asset to check out.')
      return
    }

    const confirmed = window.confirm(
      `Check out ${selectedAssets.length} asset(s) directly to yourself? This will not create a request.`,
    )

    if (!confirmed) return

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const result = await apiFetch('/api/assets/direct-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          asset_ids: selectedAssets,
          notes: notes.trim() || null,
        }),
      })

      setSuccess(
        result.message ||
          `${selectedAssets.length} asset(s) checked out successfully.`,
      )

      setSelectedAssets([])
      setNotes('')
      await loadData()
    } catch (err) {
      setError(err.message || 'Checkout failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReturn() {
    if (selectedAssets.length === 0) {
      setError('Select at least one asset to return.')
      return
    }

    const confirmed = window.confirm(
      `Return ${selectedAssets.length} asset(s) and mark them as available?`,
    )

    if (!confirmed) return

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const result = await apiFetch('/api/assets/direct-return', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          asset_ids: selectedAssets,
          notes: notes.trim() || null,
        }),
      })

      setSuccess(
        result.message ||
          `${selectedAssets.length} asset(s) returned successfully.`,
      )

      setSelectedAssets([])
      setNotes('')
      await loadData()
    } catch (err) {
      setError(err.message || 'Return failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="checkout-loading">
        Loading asset operations...
      </div>
    )
  }

  if (!hasManagementAccess) {
    return (
      <main className="checkout-page">
        <div className="checkout-error">
          <h2>Asset operations unavailable</h2>
          <p>
            Direct checkout and return are available to Managers, Admins,
            and Developers.
          </p>
        </div>
      </main>
    )
  }

  const isCheckout = mode === 'CHECKOUT'
  const statusLabel = isCheckout ? 'Available' : 'Checked out'
  const statusDescription = isCheckout
    ? 'available'
    : 'checked-out'

  return (
    <main className="checkout-page">
      <header className="checkout-header">
        <div>
          <p className="checkout-eyebrow">ASSET OPERATIONS</p>

          <h1>
            {isCheckout ? 'Direct Checkout' : 'Return Assets'}
          </h1>

          <p className="checkout-description">
            {isCheckout
              ? 'Check out available assets directly to yourself without creating a request.'
              : 'Return checked-out assets and mark them as available again.'}
          </p>
        </div>

        <div className="checkout-count">
          <span>{visibleAssets.length}</span>
          <small>
            {isCheckout ? 'Available assets' : 'Checked-out assets'}
          </small>
        </div>
      </header>

      <div className="checkout-mode-switch">
        <button
          type="button"
          className={isCheckout ? 'active' : ''}
          aria-pressed={isCheckout}
          disabled={submitting}
          onClick={() => changeMode('CHECKOUT')}
        >
          Check Out
        </button>

        <button
          type="button"
          className={!isCheckout ? 'active' : ''}
          aria-pressed={!isCheckout}
          disabled={submitting}
          onClick={() => changeMode('RETURN')}
        >
          Return
        </button>
      </div>

      {error && (
        <div className="checkout-message checkout-message-error">
          {error}
        </div>
      )}

      {success && (
        <div className="checkout-message checkout-message-success">
          {success}
        </div>
      )}

      <section className="checkout-toolbar">
        <div className="checkout-search">
          <span aria-hidden="true">⌕</span>

          <input
            type="search"
            placeholder="Search code, name, model, serial number..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {!isManager && (
          <div className="checkout-filter">
            <label htmlFor="checkout-kit-filter">Kit</label>

            <select
              id="checkout-kit-filter"
              value={selectedKit}
              onChange={(event) => setSelectedKit(event.target.value)}
            >
              <option value="ALL">All kits</option>

              {visibleKits.map((kit) => (
                <option key={kit.kit_id} value={kit.kit_id}>
                  {kit.kit_code} · {kit.kit_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <div className="checkout-table-meta">
        <span>
          Showing {filteredAssets.length} {statusDescription} asset(s)
        </span>

        <button
          type="button"
          className="checkout-text-button"
          onClick={() => setSelectedAssets([])}
          disabled={selectedAssets.length === 0 || submitting}
        >
          Clear selection
        </button>
      </div>

      <div className="checkout-table-container">
        <table className="checkout-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all visible assets"
                  checked={
                    filteredAssets.length > 0 &&
                    selectedVisibleCount === filteredAssets.length
                  }
                  onChange={toggleAllVisible}
                  disabled={filteredAssets.length === 0 || submitting}
                />
              </th>

              <th>Asset</th>
              <th>Make / Model</th>
              <th>Kit</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {filteredAssets.map((asset) => {
              const selected = selectedAssets.includes(asset.asset_id)

              return (
                <tr
                  key={asset.asset_id}
                  className={
                    selected ? 'checkout-row-selected' : ''
                  }
                >
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${asset.asset_code}`}
                      checked={selected}
                      onChange={() => toggleAsset(asset.asset_id)}
                      disabled={submitting}
                    />
                  </td>

                  <td>
                    <div className="checkout-asset-name">
                      {asset.name}
                    </div>

                    <div className="checkout-asset-code">
                      {asset.asset_code}
                    </div>
                  </td>

                  <td>
                    {[asset.make, asset.model]
                      .filter(Boolean)
                      .join(' ') || '—'}
                  </td>

                  <td>
                    <div>{asset.kit_code || '—'}</div>
                    <small>{asset.kit_name || ''}</small>
                  </td>

                  <td>
                    <span className="checkout-status">
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              )
            })}

            {filteredAssets.length === 0 && (
              <tr>
                <td colSpan="5">
                  <div className="checkout-empty">
                    <h3>
                      {isCheckout
                        ? 'No available assets found'
                        : 'No checked-out assets found'}
                    </h3>

                    <p>
                      {isCheckout
                        ? 'Try another search or kit. Only available assets can be checked out.'
                        : 'Try another search or kit. Only checked-out assets can be returned.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="checkout-action-panel">
        <div>
          <p className="checkout-eyebrow">
            {isCheckout ? 'READY TO CHECK OUT' : 'READY TO RETURN'}
          </p>

          <h2>{selectedAssets.length} asset(s) selected</h2>

          <p>
            {isCheckout
              ? 'Selected assets will be assigned to your current possession. This action does not create a request.'
              : 'Selected assets will be marked available and their current possession will be cleared. Their kit and responsible person will remain unchanged.'}
          </p>
        </div>

        <div className="checkout-action-controls">
          <label htmlFor="checkout-notes">Notes (optional)</label>

          <textarea
            id="checkout-notes"
            rows="2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={
              isCheckout
                ? 'Add a checkout note...'
                : 'Add a return note...'
            }
            disabled={submitting}
          />

          <button
            type="button"
            className="checkout-submit"
            onClick={isCheckout ? handleCheckout : handleReturn}
            disabled={submitting || selectedAssets.length === 0}
          >
            {submitting
              ? isCheckout
                ? 'Checking out...'
                : 'Returning...'
              : isCheckout
                ? `Check out ${selectedAssets.length} asset(s)`
                : `Return ${selectedAssets.length} asset(s)`}
          </button>
        </div>
      </section>
    </main>
  )
}

export default Checkout
