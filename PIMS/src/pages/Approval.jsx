import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../lib/api'
import {
  canDecideItem as canReviewItem,
  canReviewRequests,
  getApprovalQueues,
  getVerifiableReturnItems as getReturnItems,
} from '../lib/requestReview'
import './Requests.css'

function formatStatus(status) {
  if (!status) return 'Unknown'

  return status
    .toLowerCase()
    .split('_')
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ')
}

function getStatusClass(status) {
  if (!status) return ''

  return `status-${status
    .toLowerCase()
    .replace(/_/g, '-')}`
}

function getAssetDisplayName(item) {
  return [item.asset_code, item.asset_name].filter(Boolean).join(' · ') || 'Unknown asset'
}


export default function Approval() {
  const { pimsUser } = useAuth()
  if (!canReviewRequests(pimsUser)) return <Navigate to="/requests" replace />
  return <ApprovalWorkspace key={pimsUser.person_id} currentPerson={pimsUser} />
}

function ApprovalWorkspace({ currentPerson }) {
  const [requests, setRequests] = useState([])
  const [bulkDecisionSelections, setBulkDecisionSelections] = useState({})
  const [bulkDecisionNotes, setBulkDecisionNotes] = useState({})
  const [verifyReturnSelections, setVerifyReturnSelections] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionRequestId, setActionRequestId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadData() {
    setRefreshing(true)
    setError('')
    try {
      setRequests(await apiFetch('/api/requests'))
      setBulkDecisionSelections({})
      setVerifyReturnSelections({})
    } catch (err) {
      setError(err.message || 'Unable to load approvals.')
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function canDecideItem(request, item) {
    return canReviewItem(currentPerson, request, item)
  }

  function getVerifiableReturnItems(request) {
    return getReturnItems(currentPerson, request)
  }

  function clearMessages() {
    setError('')
    setSuccess('')
  }

  function getBulkDecisionItems(request) {
    return (request.items || []).filter(
      (item) => canDecideItem(request, item)
    )
  }

  function toggleBulkDecisionItem(requestId, requestItemId) {
    setBulkDecisionSelections((current) => {
      const existing = current[requestId] || []

      return {
        ...current,
        [requestId]: existing.includes(requestItemId)
          ? existing.filter((id) => id !== requestItemId)
          : [...existing, requestItemId],
      }
    })
  }

  function toggleAllDecisionItems(requestId, request) {
    const eligibleIds = getBulkDecisionItems(request).map(
      (item) => item.request_item_id
    )

    const selected = bulkDecisionSelections[requestId] || []

    const allSelected =
      eligibleIds.length > 0 &&
      eligibleIds.every((id) => selected.includes(id))

    setBulkDecisionSelections((current) => ({
      ...current,
      [requestId]: allSelected ? [] : eligibleIds,
    }))
  }

  function getDefaultVerifyReturnSelection(request) {
    return getVerifiableReturnItems(request).map(
      (item) => item.asset_id
    )
  }

  function toggleVerifyReturnAsset(requestId, assetId, defaultAssetIds) {
    setVerifyReturnSelections((current) => {
      const existing = current[requestId] ?? defaultAssetIds

      return {
        ...current,
        [requestId]: existing.includes(assetId)
          ? existing.filter((id) => id !== assetId)
          : [...existing, assetId],
      }
    })
  }

  function handleFinishDecision(request, eligibleItems) {
    const remainingIds = eligibleItems.map((item) => item.request_item_id)
    if (remainingIds.length === 0) return

    const itemLabel = remainingIds.length === 1 ? 'item' : 'items'
    if (!window.confirm(
      `Finish your review and deny the ${remainingIds.length} remaining ${itemLabel}? Earlier approvals will stay in place.`
    )) return

    return handleBulkDecision(request.request_id, 'REJECTED', remainingIds)
  }

  async function handleBulkDecision(requestId, decision, itemIds) {
    if (itemIds.length === 0 || actionRequestId !== null || refreshing) return

    clearMessages()
    setActionRequestId(requestId)

    try {
      await apiFetch(
        `/api/requests/${requestId}/items/decide-all`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            decision,
            request_item_id: itemIds,
            notes: bulkDecisionNotes[requestId]?.trim() || null,
          }),
        }
      )

      setSuccess(
        decision === 'APPROVED'
          ? `${itemIds.length} selected item${itemIds.length === 1 ? '' : 's'} approved.`
          : `Review complete. ${itemIds.length} remaining item${itemIds.length === 1 ? '' : 's'} denied.`
      )

      setBulkDecisionSelections((current) => ({
        ...current,
        [requestId]: [],
      }))

      setBulkDecisionNotes((current) => {
        const next = { ...current }
        delete next[requestId]
        return next
      })

      await loadData()
    } catch (err) {
      console.error('Error applying request decision:', err)

      setError(
        err.message || 'Failed to update request approval.'
      )
    } finally {
      setActionRequestId(null)
    }
  }

  async function handleVerifyReturn(request) {
    clearMessages()

    const defaultAssetIds =
      getDefaultVerifyReturnSelection(request)

    const selected =
      verifyReturnSelections[request.request_id] ?? defaultAssetIds

    if (selected.length === 0) {
      setError('Select at least one asset to verify as returned.')
      return
    }

    setActionRequestId(request.request_id)

    try {
      await apiFetch(
        `/api/requests/${request.request_id}/return/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            asset_ids: selected,
            notes: null,
          }),
        }
      )

      setSuccess(
        'Return verified and physical possession updated.'
      )

      setVerifyReturnSelections((current) => {
        const next = { ...current }
        delete next[request.request_id]
        return next
      })


      await loadData()
    } catch (err) {
      console.error('Failed to verify return:', err)

      setError(
        err.message || 'Failed to verify return.'
      )
    } finally {
      setActionRequestId(null)
    }
  }

  const { pending: approvalRequests, returns: returnRequests } =
    getApprovalQueues(currentPerson, requests)

  return (
    <div className="requests-page">
      <header className="requests-header">
        <div>
          <h1>Approvals</h1>
          <p className="requests-subtitle">Review equipment requests and verify returns.</p>
        </div>
        <button
          type="button"
          className="request-button request-button-light"
          onClick={loadData}
          disabled={refreshing || actionRequestId !== null}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      <Link className="request-link-button" to="/requests">Go to My Requests</Link>
      {error && <div className="request-message request-message-error" role="alert">{error}</div>}
      {success && <div className="request-message request-message-success" role="status">{success}</div>}
      {loading && <p className="requests-loading" role="status">Loading approvals…</p>}
      {(!loading && (!error || requests.length > 0)) && (
        <div className="approval-queues">
          <section className="request-section" aria-labelledby="approval-requests-heading">
            <div className="request-section-heading">
              <h2 id="approval-requests-heading">Requests to review ({approvalRequests.length})</h2>
            </div>
            {approvalRequests.length === 0 && <p className="request-empty">No requests need your decision.</p>}
            {approvalRequests.map((request) => {
              const eligible = getBulkDecisionItems(request)
              const selected =
                bulkDecisionSelections[request.request_id] || []
              const busy = refreshing || actionRequestId !== null

              const allSelected =
                eligible.length > 0 &&
                eligible.every((item) =>
                  selected.includes(item.request_item_id)
                )

              return (
                <article
                  key={request.request_id}
                  className="request-action-card"
                >
                  <div className="request-action-card-main">
                    <div>
                      <span className="request-status status-pending">
                        Approval needed
                      </span>

                      <h3>
                        {request.requester_name} requested
                        equipment
                      </h3>

                      <p>
                        {eligible.length} actionable{' '}
                        {eligible.length === 1 ? 'item' : 'items'}{' '}
                        require your decision.
                      </p>
                    </div>
                  </div>

                  {request.purpose && <p className="approval-purpose">{request.purpose}</p>}

                  <p className="requests-subtitle">
                    Approve the selected items first. Finishing denies every item still awaiting your decision.
                  </p>

                  <div className="request-selection-bar">
                    <span>
                      {selected.length} of {eligible.length} selected
                    </span>

                    <button
                      type="button"
                      className="request-link-button"
                      onClick={() =>
                        toggleAllDecisionItems(
                          request.request_id,
                          request
                        )
                      }
                      disabled={busy}
                    >
                      {allSelected ? 'Clear selection' : 'Select all'}
                    </button>
                  </div>

                  <div className="request-item-list">
                    {request.items.map((item) => {
                      const actionable =
                        canDecideItem(request, item)

                      const selectedItem =
                        selected.includes(item.request_item_id)

                      return (
                        <div
                          key={item.request_item_id}
                          className="request-item"
                        >
                          <div>
                            {actionable ? (
                              <label className="request-check-item">
                                <input
                                  type="checkbox"
                                  checked={selectedItem}
                                  onChange={() =>
                                    toggleBulkDecisionItem(
                                      request.request_id,
                                      item.request_item_id
                                    )
                                  }
                                  disabled={busy}
                                />

                                <span>
                                  <strong>
                                    {getAssetDisplayName(item)}
                                  </strong>

                                  <small>
                                    {item.responsible_person_name ||
                                      (item.responsible_person_id ? 'Unknown' : 'General')}
                                  </small>
                                </span>
                              </label>
                            ) : (
                              <div>
                                <strong>
                                  {getAssetDisplayName(item)}
                                </strong>

                                <span>
                                  {item.responsible_person_name ||
                                    (item.responsible_person_id ? 'Unknown' : 'General')}
                                </span>
                              </div>
                            )}
                          </div>

                          <span
                            className={`request-status ${getStatusClass(
                              item.approval_status
                            )}`}
                          >
                            {formatStatus(item.approval_status)}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <label className="approval-notes">
                    Decision notes (optional)
                    <textarea
                      rows={2}
                      value={bulkDecisionNotes[request.request_id] || ''}
                      disabled={busy}
                      onChange={(event) => setBulkDecisionNotes({
                        ...bulkDecisionNotes,
                        [request.request_id]: event.target.value,
                      })}
                    />
                  </label>

                  <div className="request-action-buttons">
                    <button
                      type="button"
                      className="request-button request-button-primary"
                      disabled={busy || selected.length === 0}
                      onClick={() =>
                        handleBulkDecision(
                          request.request_id,
                          'APPROVED',
                          selected
                        )
                      }
                    >
                      {actionRequestId === request.request_id
                        ? 'Saving…'
                        : `Approve selected${
                            selected.length > 0
                              ? ` (${selected.length})`
                              : ''
                          }`}
                    </button>

                    <button
                      type="button"
                      className="request-button request-button-danger"
                      disabled={busy || eligible.length === 0}
                      onClick={() => handleFinishDecision(request, eligible)}
                    >
                      Finish decision
                    </button>
                  </div>
                </article>
              )
            })}
          </section>
          <section className="request-section" aria-labelledby="approval-returns-heading">
            <div className="request-section-heading">
              <h2 id="approval-returns-heading">Returns to verify ({returnRequests.length})</h2>
            </div>
            {returnRequests.length === 0 && <p className="request-empty">No returns need verification.</p>}
            {returnRequests.map((request) => {
              const busy = refreshing || actionRequestId !== null

              const verifiableItems =
                getVerifiableReturnItems(request)

              const defaultVerifyIds =
                verifiableItems.map((item) => item.asset_id)

              const selectedVerifyIds =
                verifyReturnSelections[request.request_id] ??
                defaultVerifyIds

              return (
                <article
                  key={request.request_id}
                  className="request-action-card"
                >
                  <div className="request-action-card-main">
                    <div>
                      <span className="request-status status-return-pending">
                        Return to verify
                      </span>

                      <h3>
                        {request.requester_name} returned
                        equipment
                      </h3>

                      <p>
                        Equipment eligible for verification is
                        selected by default. Untick anything that has
                        not physically come back.
                      </p>
                    </div>
                  </div>

                  <div className="request-selection-bar">
                    <span>
                      {selectedVerifyIds.length} of{' '}
                      {verifiableItems.length} selected
                    </span>
                  </div>

                  <div className="request-check-list">
                    {verifiableItems.map((item) => (
                      <label key={item.request_item_id}>
                        <input
                          type="checkbox"
                          checked={selectedVerifyIds.includes(
                            item.asset_id
                          )}
                          onChange={() =>
                            toggleVerifyReturnAsset(
                              request.request_id,
                              item.asset_id,
                              defaultVerifyIds
                            )
                          }
                          disabled={busy}
                        />

                        <span>
                          {getAssetDisplayName(item)}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="request-action-buttons">
                    <button
                      type="button"
                      className="request-button request-button-primary"
                      disabled={
                        busy || selectedVerifyIds.length === 0
                      }
                      onClick={() =>
                        handleVerifyReturn(request)
                      }
                    >
                      {actionRequestId === request.request_id
                        ? 'Verifying…'
                        : `Verify returned (${selectedVerifyIds.length})`}
                    </button>
                  </div>
                </article>
              )
            })}
          </section>
        </div>
      )}
    </div>
  )
}
