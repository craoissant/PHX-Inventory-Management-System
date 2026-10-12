
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import './Requests.css'

const MANAGEMENT_ROLES = ['MANAGER', 'ADMIN', 'DEVELOPER']

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

function formatDate(value) {
  if (!value) return '—'

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatPerson(person) {
  if (!person) return 'Unassigned'

  return (
    [person.first_name, person.last_name]
      .filter(Boolean)
      .join(' ') || 'Unknown'
  )
}

function getStatusClass(status) {
  if (!status) return ''

  return `status-${status
    .toLowerCase()
    .replace(/_/g, '-')}`
}

function getAssetDisplayName(asset) {
  if (!asset) return 'Unknown asset'

  const parts = [asset.asset_code, asset.name]

  if (asset.make || asset.model) {
    parts.push(
      [asset.make, asset.model]
        .filter(Boolean)
        .join(' ')
    )
  }

  return parts.filter(Boolean).join(' · ')
}

function dateStartIso(value) {
  if (!value) return null

  return new Date(
    `${value}T00:00:00`
  ).toISOString()
}

function dateEndIso(value) {
  if (!value) return null

  return new Date(
    `${value}T23:59:59.999`
  ).toISOString()
}

export default function Requests() {
  const [requests, setRequests] = useState([])
  const [assets, setAssets] = useState([])
  const [kits, setKits] = useState([])
  const [people, setPeople] = useState([])
  const [currentPerson, setCurrentPerson] =
    useState(null)

  const [selectedAssets, setSelectedAssets] =
    useState([])
  const [selectedKitId, setSelectedKitId] =
    useState('')
  const [assetSearch, setAssetSearch] =
    useState('')

  const [purpose, setPurpose] = useState('')
  const [neededFrom, setNeededFrom] =
    useState('')
  const [neededUntil, setNeededUntil] =
    useState('')

  const [checkoutSelections, setCheckoutSelections] =
    useState({})
  const [returnSelections, setReturnSelections] =
    useState({})
  const [
    verifyReturnSelections,
    setVerifyReturnSelections,
  ] = useState({})
  const [
    bulkDecisionSelections,
    setBulkDecisionSelections,
  ] = useState({})
  const [expandedRequests, setExpandedRequests] =
    useState({})

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] =
    useState(false)
  const [actionRequestId, setActionRequestId] =
    useState(null)
  const [refreshing, setRefreshing] =
    useState(false)

  const [bulkDecisionNotes, setBulkDecisionNotes] =
    useState({})
  const [returnNotes, setReturnNotes] =
    useState({})

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const peopleById = useMemo(() => {
    return people.reduce((map, person) => {
      map[person.person_id] = person
      return map
    }, {})
  }, [people])

  const assetsById = useMemo(() => {
    return assets.reduce((map, asset) => {
      map[asset.asset_id] = asset
      return map
    }, {})
  }, [assets])

  const kitsById = useMemo(() => {
    return kits.reduce((map, kit) => {
      map[kit.kit_id] = kit
      return map
    }, {})
  }, [kits])

  const availableAssets = useMemo(() => {
    if (!currentPerson) return []

    return assets.filter(
      (asset) =>
        asset.status === 'AVAILABLE' &&
        asset.current_possession_id !==
          currentPerson.person_id
    )
  }, [assets, currentPerson])

  const filteredAvailableAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase()

    if (!query) return availableAssets

    return availableAssets.filter((asset) => {
      const searchable = [
        asset.asset_code,
        asset.name,
        asset.make,
        asset.model,
        asset.serial_number,
        asset.asset_type,
        asset.kit?.kit_code,
        asset.kit?.kit_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(query)
    })
  }, [availableAssets, assetSearch])

  const currentRole =
    currentPerson?.system_role || null

  const canManageRequests =
    MANAGEMENT_ROLES.includes(currentRole)

  async function loadData(showRefresh = false) {
    if (showRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const [
        currentPersonData,
        peopleData,
        assetsData,
        kitsData,
        requestsData,
      ] = await Promise.all([
        apiFetch('/api/auth/me'),
        apiFetch('/api/people'),
        apiFetch('/api/assets'),
        apiFetch('/api/kits'),
        apiFetch('/api/requests'),
      ])

      const requestDetails = await Promise.all(
        (requestsData ?? []).map((request) =>
          apiFetch(
            `/api/requests/${request.request_id}`
          )
        )
      )

      const peopleList = peopleData ?? []
      const assetsList = assetsData ?? []
      const kitsList = kitsData ?? []

      const peopleMap = new Map(
        peopleList.map((person) => [
          person.person_id,
          person,
        ])
      )

      const assetsMap = new Map(
        assetsList.map((asset) => [
          asset.asset_id,
          asset,
        ])
      )

      const kitsMap = new Map(
        kitsList.map((kit) => [
          kit.kit_id,
          kit,
        ])
      )

      const enrichedRequests =
        requestDetails.map((request) => ({
          ...request,

          requester:
            peopleMap.get(
              request.requested_by
            ) ?? {
              person_id: request.requested_by,
              first_name:
                request.requester_name?.split(
                  ' '
                )[0] ?? '',
              last_name:
                request.requester_name
                  ?.split(' ')
                  .slice(1)
                  .join(' ') ?? '',
            },

          decidedBy: request.decided_by
            ? peopleMap.get(
                request.decided_by
              ) ?? null
            : null,

          requestedKit:
            request.requested_kit_id
              ? kitsMap.get(
                  request.requested_kit_id
                ) ?? null
              : null,

          items: (request.items ?? []).map(
            (item) => ({
              ...item,

              asset:
                assetsMap.get(item.asset_id) ??
                {
                  asset_id: item.asset_id,
                  asset_code:
                    item.asset_code,
                  name: item.asset_name,
                },
            })
          ),
        }))

      setCurrentPerson(currentPersonData)
      setPeople(peopleList)
      setAssets(assetsList)
      setKits(kitsList)
      setRequests(enrichedRequests)
    } catch (err) {
      console.error(
        'Error loading requests:',
        err
      )
      setError(
        err.message ||
          'Failed to load requests.'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function clearMessages() {
    setError('')
    setSuccess('')
  }

  /*
   * ---------------------------------------------------------
   * KIT / ASSET SELECTION
   * ---------------------------------------------------------
   */

  function handleKitChange(kitId) {
    setSelectedKitId(kitId)

    if (!kitId) {
      setSelectedAssets([])
      return
    }

    const kitAssetIds = assets
      .filter(
        (asset) =>
          asset.kit_id === kitId &&
          asset.status === 'AVAILABLE' &&
          asset.current_possession_id !==
            currentPerson?.person_id
      )
      .map((asset) => asset.asset_id)

    setSelectedAssets(kitAssetIds)
  }

  function toggleAsset(assetId) {
    setSelectedAssets((current) => {
      if (current.includes(assetId)) {
        return current.filter(
          (id) => id !== assetId
        )
      }

      return [...current, assetId]
    })
  }

  function clearSelectedAssets() {
    setSelectedAssets([])
  }

  /*
   * ---------------------------------------------------------
   * MANAGER APPROVAL
   * ---------------------------------------------------------
   */

  function canDecideItem(request, item) {
    if (!currentPerson) return false

    if (
      request.requested_by ===
      currentPerson.person_id
    ) {
      return false
    }

    if (request.status !== 'PENDING') {
      return false
    }

    if (item.approval_status !== 'PENDING') {
      return false
    }

    if (
      currentRole === 'ADMIN' ||
      currentRole === 'DEVELOPER'
    ) {
      return true
    }

    if (currentRole === 'MANAGER') {
      return (
        item.responsible_person_id ===
        currentPerson.person_id
      )
    }

    return false
  }

  function getBulkDecisionItems(request) {
    return (request.items || []).filter(
      (item) =>
        canDecideItem(request, item)
    )
  }

  function toggleBulkDecisionItem(
    requestId,
    requestItemId
  ) {
    setBulkDecisionSelections((current) => {
      const existing =
        current[requestId] || []

      return {
        ...current,
        [requestId]: existing.includes(
          requestItemId
        )
          ? existing.filter(
              (id) =>
                id !== requestItemId
            )
          : [
              ...existing,
              requestItemId,
            ],
      }
    })
  }

  function toggleAllDecisionItems(
    requestId,
    request
  ) {
    const eligibleIds =
      getBulkDecisionItems(request).map(
        (item) =>
          item.request_item_id
      )

    const selected =
      bulkDecisionSelections[
        requestId
      ] || []

    const allSelected =
      eligibleIds.length > 0 &&
      eligibleIds.every((id) =>
        selected.includes(id)
      )

    setBulkDecisionSelections(
      (current) => ({
        ...current,
        [requestId]: allSelected
          ? []
          : eligibleIds,
      })
    )
  }

  /*
   * ---------------------------------------------------------
   * CHECKOUT / RETURN SELECTIONS
   * ---------------------------------------------------------
   */

  function toggleCheckoutAsset(
    requestId,
    assetId,
    defaultAssetIds
  ) {
    setCheckoutSelections((current) => {
      const existing =
        current[requestId] ??
        defaultAssetIds

      return {
        ...current,
        [requestId]: existing.includes(
          assetId
        )
          ? existing.filter(
              (id) => id !== assetId
            )
          : [...existing, assetId],
      }
    })
  }

  function toggleReturnAsset(
    requestId,
    assetId,
    defaultAssetIds
  ) {
    setReturnSelections((current) => {
      const existing =
        current[requestId] ??
        defaultAssetIds

      return {
        ...current,
        [requestId]: existing.includes(
          assetId
        )
          ? existing.filter(
              (id) => id !== assetId
            )
          : [...existing, assetId],
      }
    })
  }

  /*
   * ---------------------------------------------------------
   * RETURN VERIFICATION
   *
   * IMPORTANT:
   *
   * RETURN_PENDING is a request-level status.
   *
   * At item level:
   *
   * TAKEN    = requester still has it
   * RETURNED  = requester declared it returned,
   *             manager must verify it
   * VERIFIED  = manager verified the return
   * ---------------------------------------------------------
   */

  function canVerifyReturnItem(item) {
    if (!currentPerson) return false

    if (
      currentRole === 'ADMIN' ||
      currentRole === 'DEVELOPER'
    ) {
      return true
    }

    if (currentRole !== 'MANAGER') {
      return false
    }

    /*
     * General-kit assets have no responsible
     * person, so any manager may verify them.
     *
     * Otherwise only the responsible manager
     * may verify the asset.
     */
    return (
      item.responsible_person_id ===
        currentPerson.person_id ||
      !item.responsible_person_id
    )
  }

  function getVerifiableReturnItems(request) {
    return (request.items || []).filter(
      (item) =>
        item.item_status === 'RETURNED' &&
        canVerifyReturnItem(item)
    )
  }

  function getDefaultVerifyReturnSelection(
    request
  ) {
    return getVerifiableReturnItems(
      request
    ).map((item) => item.asset_id)
  }

  function toggleVerifyReturnAsset(
    requestId,
    assetId,
    defaultAssetIds
  ) {
    setVerifyReturnSelections(
      (current) => {
        const existing =
          current[requestId] ??
          defaultAssetIds

        return {
          ...current,
          [requestId]:
            existing.includes(assetId)
              ? existing.filter(
                  (id) =>
                    id !== assetId
                )
              : [
                  ...existing,
                  assetId,
                ],
        }
      }
    )
  }

  /*
   * ---------------------------------------------------------
   * CREATE REQUEST
   * ---------------------------------------------------------
   */

  async function handleCreateRequest(
    event
  ) {
    event.preventDefault()
    clearMessages()

    if (!currentPerson) {
      setError(
        'Your person record could not be found.'
      )
      return
    }

    if (!neededFrom || !neededUntil) {
      setError(
        'Please provide both a start date and an end date.'
      )
      return
    }

    if (neededUntil < neededFrom) {
      setError(
        'The end date cannot be before the start date.'
      )
      return
    }

    if (selectedAssets.length === 0) {
      setError(
        'Please select at least one asset.'
      )
      return
    }

    setCreating(true)

    try {
      const data = await apiFetch(
        '/api/requests',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            asset_ids: selectedAssets,
            requested_kit_id:
              selectedKitId || null,
            purpose:
              purpose.trim() || null,
            needed_from:
              dateStartIso(neededFrom),
            needed_until:
              dateEndIso(neededUntil),
          }),
        }
      )

      setSuccess(
        `Request ${data.request_id} created successfully.`
      )

      setSelectedAssets([])
      setSelectedKitId('')
      setPurpose('')
      setNeededFrom('')
      setNeededUntil('')
      setAssetSearch('')

      await loadData()
    } catch (err) {
      console.error(
        'Failed to create request:',
        err
      )

      setError(
        err.message ||
          'Failed to create request.'
      )
    } finally {
      setCreating(false)
    }
  }

  /*
   * ---------------------------------------------------------
   * CANCEL
   * ---------------------------------------------------------
   */

  async function handleCancelRequest(
    requestId
  ) {
    clearMessages()
    setActionRequestId(requestId)

    try {
      await apiFetch(
        `/api/requests/${requestId}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            notes: null,
          }),
        }
      )

      setSuccess('Request cancelled.')
      await loadData()
    } catch (err) {
      console.error(
        'Failed to cancel request:',
        err
      )

      setError(
        err.message ||
          'Failed to cancel request.'
      )
    } finally {
      setActionRequestId(null)
    }
  }

  /*
   * ---------------------------------------------------------
   * MANAGER DECISION
   * ---------------------------------------------------------
   */

  async function handleBulkDecision(
    requestId,
    decision
  ) {
    clearMessages()

    const selected =
      bulkDecisionSelections[
        requestId
      ] || []

    if (selected.length === 0) {
      setError(
        decision === 'APPROVED'
          ? 'Select at least one item to approve.'
          : 'Select at least one item to deny.'
      )
      return
    }

    setActionRequestId(requestId)

    try {
      await apiFetch(
        `/api/requests/${requestId}/items/decide-all`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            decision,
            request_item_id: selected,
            notes:
              bulkDecisionNotes[
                requestId
              ]?.trim() || null,
          }),
        }
      )

      setSuccess(
        decision === 'APPROVED'
          ? `${selected.length} selected item${
              selected.length === 1
                ? ''
                : 's'
            } approved.`
          : `${selected.length} selected item${
              selected.length === 1
                ? ''
                : 's'
            } denied.`
      )

      setBulkDecisionSelections(
        (current) => ({
          ...current,
          [requestId]: [],
        })
      )

      setBulkDecisionNotes((current) => {
        const next = { ...current }
        delete next[requestId]
        return next
      })

      await loadData()
    } catch (err) {
      console.error(
        'Error applying request decision:',
        err
      )

      setError(
        err.message ||
          'Failed to update request approval.'
      )
    } finally {
      setActionRequestId(null)
    }
  }

  /*
   * ---------------------------------------------------------
   * CHECKOUT
   * ---------------------------------------------------------
   */

  
  async function handleDeclareCheckout(request) {
    clearMessages()

    const requestId = request.request_id

    const approvedAssetIds = request.items
      .filter(
        (item) =>
          item.item_status === 'REQUESTED' &&
          item.approval_status === 'APPROVED'
      )
      .map((item) => item.asset_id)

    const selected =
      checkoutSelections[requestId] ?? approvedAssetIds

    if (selected.length === 0) {
      setError(
        'Select at least one asset that you actually took.'
      )
      return
    }

    setActionRequestId(requestId)

    try {
      await apiFetch(
        `/api/requests/${requestId}/checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            asset_ids: selected,
          }),
        }
      )

      setSuccess('Equipment taken successfully.')

      setCheckoutSelections((current) => {
        const next = { ...current }
        delete next[requestId]
        return next
      })

      await loadData()
    } catch (err) {
      console.error(
        'Failed to declare checkout:',
        err
      )

      setError(
        err.message ||
          'Failed to check out equipment.'
      )
    } finally {
      setActionRequestId(null)
    }
  }


  /*
   * ---------------------------------------------------------
   * RETURN
   * ---------------------------------------------------------
   */

  async function handleDeclareReturn(
    request
  ) {
    clearMessages()

    const takenAssetIds =
      request.items
        .filter(
          (item) =>
            item.item_status === 'TAKEN'
        )
        .map(
          (item) => item.asset_id
        )

    const selected =
      returnSelections[
        request.request_id
      ] ?? takenAssetIds

    if (selected.length === 0) {
      setError(
        'Select at least one asset that you actually returned.'
      )
      return
    }

    setActionRequestId(
      request.request_id
    )

    try {
      await apiFetch(
        `/api/requests/${request.request_id}/return`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            asset_ids: selected,
          }),
        }
      )

      setSuccess(
        'Return declaration submitted for verification.'
      )

      setReturnSelections(
        (current) => {
          const next = { ...current }
          delete next[request.request_id]
          return next
        }
      )

      await loadData()
    } catch (err) {
      console.error(
        'Failed to declare return:',
        err
      )

      setError(
        err.message ||
          'Failed to declare return.'
      )
    } finally {
      setActionRequestId(null)
    }
  }

  /*
   * ---------------------------------------------------------
   * VERIFY RETURN
   * ---------------------------------------------------------
   */

  async function handleVerifyReturn(
    request
  ) {
    clearMessages()

    const defaultAssetIds =
      getDefaultVerifyReturnSelection(
        request
      )

    const selected =
      verifyReturnSelections[
        request.request_id
      ] ?? defaultAssetIds

    if (selected.length === 0) {
      setError(
        'Select at least one asset to verify as returned.'
      )
      return
    }

    setActionRequestId(
      request.request_id
    )

    try {
      await apiFetch(
        `/api/requests/${request.request_id}/return/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            asset_ids: selected,
            notes:
              returnNotes[
                request.request_id
              ]?.trim() || null,
          }),
        }
      )

      setSuccess(
        'Return verified and physical possession updated.'
      )

      setVerifyReturnSelections(
        (current) => {
          const next = { ...current }
          delete next[request.request_id]
          return next
        }
      )

      setReturnNotes((current) => ({
        ...current,
        [request.request_id]: '',
      }))

      await loadData()
    } catch (err) {
      console.error(
        'Failed to verify return:',
        err
      )

      setError(
        err.message ||
          'Failed to verify return.'
      )
    } finally {
      setActionRequestId(null)
    }
  }

  function toggleRequestExpanded(
    requestId
  ) {
    setExpandedRequests((current) => ({
      ...current,
      [requestId]:
        !current[requestId],
    }))
  }

  if (loading) {
    return (
      <div className="requests-page">
        <div className="requests-loading">
          Loading requests…
        </div>
      </div>
    )
  }

  const myRequests = requests.filter(
    (request) =>
      request.requested_by ===
      currentPerson?.person_id
  )

  const approvalRequests = requests.filter(
    (request) =>
      request.status === 'PENDING' &&
      getBulkDecisionItems(request)
        .length > 0
  )

  const returnRequests = requests.filter(
    (request) =>
      request.status ===
        'RETURN_PENDING' &&
      canManageRequests
  )

  return (
    <div className="requests-page">
      <header className="requests-header">
        <div>
          <p className="eyebrow">
            Equipment
          </p>

          <h1>Requests</h1>

          <p className="requests-subtitle">
            Ask for equipment, approve what
            you are responsible for, and keep
            track of what is out.
          </p>
        </div>

        <button
          type="button"
          className="request-button request-button-light"
          onClick={() =>
            loadData(true)
          }
          disabled={refreshing}
        >
          {refreshing
            ? 'Refreshing…'
            : 'Refresh'}
        </button>
      </header>

      {error && (
        <div className="request-message request-message-error">
          {error}
        </div>
      )}

      {success && (
        <div className="request-message request-message-success">
          {success}
        </div>
      )}

      <div className="request-layout">
        <main className="request-main-column">

          {/* =====================================================
              MANAGER WORKSPACE
          ====================================================== */}

          {canManageRequests &&
            (approvalRequests.length > 0 ||
              returnRequests.length > 0) && (
              <section className="request-section">
                <div className="request-section-heading">
                  <div>
                    <p className="eyebrow">
                      Manager
                    </p>

                    <h2>
                      Needs your attention
                    </h2>
                  </div>
                </div>

                {/* APPROVAL REQUESTS */}

                {approvalRequests.map(
                  (request) => {
                    const eligible =
                      getBulkDecisionItems(
                        request
                      )

                    const selected =
                      bulkDecisionSelections[
                        request.request_id
                      ] || []

                    const busy =
                      actionRequestId ===
                      request.request_id

                    const allSelected =
                      eligible.length > 0 &&
                      eligible.every(
                        (item) =>
                          selected.includes(
                            item.request_item_id
                          )
                      )

                    return (
                      <article
                        key={
                          request.request_id
                        }
                        className="request-action-card"
                      >
                        <div className="request-action-card-main">
                          <div>
                            <span className="request-status status-pending">
                              Approval needed
                            </span>

                            <h3>
                              {formatPerson(
                                request.requester
                              )}{' '}
                              requested equipment
                            </h3>

                            <p>
                              {
                                eligible.length
                              }{' '}
                              actionable{' '}
                              {eligible.length ===
                              1
                                ? 'item'
                                : 'items'}{' '}
                              require your
                              decision.
                            </p>
                          </div>
                        </div>

                        <div className="request-selection-bar">
                          <span>
                            {
                              selected.length
                            }{' '}
                            of{' '}
                            {
                              eligible.length
                            }{' '}
                            selected
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
                            {allSelected
                              ? 'Clear selection'
                              : 'Select all'}
                          </button>
                        </div>

                        <div className="request-item-list">
                          {request.items.map(
                            (item) => {
                              const actionable =
                                canDecideItem(
                                  request,
                                  item
                                )

                              const selectedItem =
                                selected.includes(
                                  item.request_item_id
                                )

                              return (
                                <div
                                  key={
                                    item.request_item_id
                                  }
                                  className="request-item"
                                >
                                  <div>
                                    {actionable ? (
                                      <label className="request-check-item">
                                        <input
                                          type="checkbox"
                                          checked={
                                            selectedItem
                                          }
                                          onChange={() =>
                                            toggleBulkDecisionItem(
                                              request.request_id,
                                              item.request_item_id
                                            )
                                          }
                                          disabled={
                                            busy
                                          }
                                        />

                                        <span>
                                          <strong>
                                            {getAssetDisplayName(
                                              item.asset
                                            )}
                                          </strong>

                                          <small>
                                            {item.responsible_person_name ||
                                              (item.responsible_person_id
                                                ? formatPerson(
                                                    peopleById[
                                                      item
                                                        .responsible_person_id
                                                    ]
                                                  )
                                                : 'General')}
                                          </small>
                                        </span>
                                      </label>
                                    ) : (
                                      <div>
                                        <strong>
                                          {getAssetDisplayName(
                                            item.asset
                                          )}
                                        </strong>

                                        <span>
                                          {item.responsible_person_name ||
                                            (item.responsible_person_id
                                              ? formatPerson(
                                                  peopleById[
                                                    item
                                                      .responsible_person_id
                                                  ]
                                                )
                                              : 'General')}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  <span
                                    className={`request-status ${getStatusClass(
                                      item.approval_status
                                    )}`}
                                  >
                                    {formatStatus(
                                      item.approval_status
                                    )}
                                  </span>
                                </div>
                              )
                            }
                          )}
                        </div>

                        <div className="request-action-buttons">
                          <button
                            type="button"
                            className="request-button request-button-primary"
                            disabled={
                              busy ||
                              selected.length ===
                                0
                            }
                            onClick={() =>
                              handleBulkDecision(
                                request.request_id,
                                'APPROVED'
                              )
                            }
                          >
                            {busy
                              ? 'Saving…'
                              : `Approve selected${
                                  selected.length >
                                  0
                                    ? ` (${selected.length})`
                                    : ''
                                }`}
                          </button>

                          <button
                            type="button"
                            className="request-button request-button-danger"
                            disabled={
                              busy ||
                              selected.length ===
                                0
                            }
                            onClick={() =>
                              handleBulkDecision(
                                request.request_id,
                                'REJECTED'
                              )
                            }
                          >
                            {busy
                              ? 'Saving…'
                              : `Deny selected${
                                  selected.length >
                                  0
                                    ? ` (${selected.length})`
                                    : ''
                                }`}
                          </button>
                        </div>
                      </article>
                    )
                  }
                )}

                {/* RETURN VERIFICATION */}

                {returnRequests.map(
                  (request) => {
                    const busy =
                      actionRequestId ===
                      request.request_id

                    const verifiableItems =
                      getVerifiableReturnItems(
                        request
                      )

                    const defaultVerifyIds =
                      verifiableItems.map(
                        (item) =>
                          item.asset_id
                      )

                    const selectedVerifyIds =
                      verifyReturnSelections[
                        request.request_id
                      ] ??
                      defaultVerifyIds

                    return (
                      <article
                        key={
                          request.request_id
                        }
                        className="request-action-card"
                      >
                        <div className="request-action-card-main">
                          <div>
                            <span className="request-status status-return-pending">
                              Return to verify
                            </span>

                            <h3>
                              {formatPerson(
                                request.requester
                              )}{' '}
                              returned equipment
                            </h3>

                            <p>
                              Everything that
                              has been declared
                              returned is
                              selected by
                              default. Untick
                              anything that has
                              not physically
                              come back.
                            </p>
                          </div>
                        </div>

                        <div className="request-selection-bar">
                          <span>
                            {
                              selectedVerifyIds.length
                            }{' '}
                            of{' '}
                            {
                              verifiableItems.length
                            }{' '}
                            selected
                          </span>
                        </div>

                        <div className="request-check-list">
                          {verifiableItems.map(
                            (item) => (
                              <label
                                key={
                                  item.request_item_id
                                }
                              >
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
                                  {getAssetDisplayName(
                                    item.asset
                                  )}
                                </span>
                              </label>
                            )
                          )}
                        </div>

                        {verifiableItems.length ===
                          0 && (
                          <p>
                            No returned
                            equipment is
                            currently available
                            for verification.
                          </p>
                        )}

                        <div className="request-action-buttons">
                          <button
                            type="button"
                            className="request-button request-button-primary"
                            disabled={
                              busy ||
                              selectedVerifyIds.length ===
                                0
                            }
                            onClick={() =>
                              handleVerifyReturn(
                                request
                              )
                            }
                          >
                            {busy
                              ? 'Verifying…'
                              : `Verify returned (${selectedVerifyIds.length})`}
                          </button>
                        </div>
                      </article>
                    )
                  }
                )}
              </section>
            )}

          {/* =====================================================
              MY REQUESTS
          ====================================================== */}

          <section className="request-section">
            <div className="request-section-heading">
              <div>
                <p className="eyebrow">
                  Your equipment
                </p>

                <h2>My requests</h2>
              </div>
            </div>

            {myRequests.length === 0 ? (
              <div className="request-empty">
                You haven't made any equipment
                requests yet.
              </div>
            ) : (
              <div className="request-list">
                {myRequests.map(
                  (request) => {
                    const expanded =
                      !!expandedRequests[
                        request.request_id
                      ]

                    const busy =
                      actionRequestId ===
                      request.request_id

                    const approvedItems =
                      request.items.filter(
                        (item) =>
                          item.item_status ===
                            'REQUESTED' &&
                          item.approval_status ===
                            'APPROVED'
                      )

                    const takenItems =
                      request.items.filter(
                        (item) =>
                          item.item_status ===
                          'TAKEN'
                      )

                    const approvedAssetIds =
                      approvedItems.map(
                        (item) =>
                          item.asset_id
                      )

                    const takenAssetIds =
                      takenItems.map(
                        (item) =>
                          item.asset_id
                      )

                    const selectedCheckout =
                      checkoutSelections[
                        request.request_id
                      ] ??
                      approvedAssetIds

                    const selectedReturn =
                      returnSelections[
                        request.request_id
                      ] ??
                      takenAssetIds

                    return (
                      <article
                        key={
                          request.request_id
                        }
                        className="request-history-card"
                      >
                        <button
                          type="button"
                          className="request-card-top"
                          onClick={() =>
                            toggleRequestExpanded(
                              request.request_id
                            )
                          }
                        >
                          <div>
                            <span className="request-card-date">
                              {formatDate(
                                request.created_at
                              )}
                            </span>

                            <h3>
                              {request.requestedKit
                                ? `${request.requestedKit.kit_code} · ${request.requestedKit.kit_name}`
                                : `${request.items.length} equipment item${
                                    request.items.length ===
                                    1
                                      ? ''
                                      : 's'
                                  }`}
                            </h3>

                            {request.purpose && (
                              <p>
                                {
                                  request.purpose
                                }
                              </p>
                            )}
                          </div>

                          <div className="request-card-status">
                            <span
                              className={`request-status ${getStatusClass(
                                request.status
                              )}`}
                            >
                              {formatStatus(
                                request.status
                              )}
                            </span>

                            <span className="request-chevron">
                              {expanded
                                ? '−'
                                : '+'}
                            </span>
                          </div>
                        </button>

                        {expanded && (
                          <div className="request-card-body">
                            <div className="request-card-details">
                              <span>
                                <strong>
                                  From
                                </strong>

                                {formatDate(
                                  request.needed_from
                                )}
                              </span>

                              <span>
                                <strong>
                                  Return by
                                </strong>

                                {formatDate(
                                  request.needed_until
                                )}
                              </span>

                              <span>
                                <strong>
                                  Equipment
                                </strong>

                                {
                                  request.items
                                    .length
                                }{' '}
                                item
                                {request.items
                                  .length ===
                                1
                                  ? ''
                                  : 's'}
                              </span>
                            </div>

                            <div className="request-item-list">
                              {request.items.map(
                                (item) => (
                                  <div
                                    key={
                                      item.request_item_id
                                    }
                                    className="request-item"
                                  >
                                    <div>
                                      <strong>
                                        {getAssetDisplayName(
                                          item.asset
                                        )}
                                      </strong>

                                      <span>
                                        {item.responsible_person_name ||
                                          (item.responsible_person_id
                                            ? formatPerson(
                                                peopleById[
                                                  item
                                                    .responsible_person_id
                                                ]
                                              )
                                            : 'General')}
                                      </span>
                                    </div>

                                    <div className="request-item-meta">
                                      <span
                                        className={`request-status ${getStatusClass(
                                          item.approval_status
                                        )}`}
                                      >
                                        {formatStatus(
                                          item.approval_status
                                        )}
                                      </span>

                                      <span>
                                        {formatStatus(
                                          item.item_status
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>

                            {/* PENDING */}

                            {request.status ===
                              'PENDING' && (
                              <div className="request-inline-action">
                                <p>
                                  Waiting for the
                                  responsible
                                  manager to
                                  approve this
                                  request.
                                </p>

                                <button
                                  type="button"
                                  className="request-button request-button-light"
                                  disabled={
                                    busy
                                  }
                                  onClick={() =>
                                    handleCancelRequest(
                                      request.request_id
                                    )
                                  }
                                >
                                  {busy
                                    ? 'Cancelling…'
                                    : 'Cancel request'}
                                </button>
                              </div>
                            )}

                            {/* CHECKOUT */}

                            {[
                              'APPROVED',
                              'CHECKED_OUT',
                            ].includes(
                              request.status
                            ) &&
                              approvedItems.length >
                                0 && (
                                <div className="request-inline-action request-take-action">
                                  <p className="eyebrow">
                                    Approved
                                  </p>

                                  <h4>
                                    What did you
                                    actually take?
                                  </h4>

                                  <p>
                                    Everything is
                                    selected by
                                    default.
                                    Untick
                                    anything you
                                    did not take.
                                  </p>

                                  <div className="request-check-list">
                                    {approvedItems.map(
                                      (item) => (
                                        <label
                                          key={
                                            item.request_item_id
                                          }
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedCheckout.includes(
                                              item.asset_id
                                            )}
                                            onChange={() =>
                                              toggleCheckoutAsset(
                                                request.request_id,
                                                item.asset_id,
                                                approvedAssetIds
                                              )
                                            }
                                          />

                                          <span>
                                            {getAssetDisplayName(
                                              item.asset
                                            )}
                                          </span>
                                        </label>
                                      )
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    className="request-button request-button-primary"
                                    disabled={
                                      busy ||
                                      selectedCheckout.length ===
                                        0
                                    }
                                    onClick={() =>
                                      handleDeclareCheckout(
                                        request
                                      )
                                    }
                                  >
                                    {busy
                                      ? 'Saving…'
                                      : `Confirm taken (${selectedCheckout.length})`}
                                  </button>
                                </div>
                              )}

                            {/* RETURN */}

                            {request.status ===
                              'CHECKED_OUT' &&
                              takenItems.length >
                                0 && (
                                <div className="request-inline-action request-take-action">
                                  <p className="eyebrow">
                                    Returning
                                  </p>

                                  <h4>
                                    What did you
                                    bring back?
                                  </h4>

                                  <p>
                                    Everything is
                                    selected by
                                    default.
                                    Untick
                                    anything you
                                    did not
                                    return.
                                  </p>

                                  <div className="request-check-list">
                                    {takenItems.map(
                                      (item) => (
                                        <label
                                          key={
                                            item.request_item_id
                                          }
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedReturn.includes(
                                              item.asset_id
                                            )}
                                            onChange={() =>
                                              toggleReturnAsset(
                                                request.request_id,
                                                item.asset_id,
                                                takenAssetIds
                                              )
                                            }
                                          />

                                          <span>
                                            {getAssetDisplayName(
                                              item.asset
                                            )}
                                          </span>
                                        </label>
                                      )
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    className="request-button request-button-primary"
                                    disabled={
                                      busy ||
                                      selectedReturn.length ===
                                        0
                                    }
                                    onClick={() =>
                                      handleDeclareReturn(
                                        request
                                      )
                                    }
                                  >
                                    {busy
                                      ? 'Sending…'
                                      : `Return equipment (${selectedReturn.length})`}
                                  </button>
                                </div>
                              )}

                            {/* RETURN PENDING */}

                            {request.status ===
                              'RETURN_PENDING' && (
                              <div className="request-inline-action request-info-action">
                                <p className="eyebrow">
                                  Return sent
                                </p>

                                <h4>
                                  Waiting for the
                                  responsible
                                  manager to
                                  verify the
                                  return.
                                </h4>

                                <p>
                                  You don't need to
                                  do anything else.
                                </p>
                              </div>
                            )}

                            {/* REJECTED */}

                            {request.status ===
                              'REJECTED' && (
                              <div className="request-inline-action request-info-action">
                                <p className="eyebrow">
                                  Request denied
                                </p>

                                <h4>
                                  This request was
                                  not approved.
                                </h4>
                              </div>
                            )}

                            {/* COMPLETE */}

                            {[
                              'COMPLETED',
                              'FULFILLED',
                            ].includes(
                              request.status
                            ) && (
                              <div className="request-inline-action request-info-action">
                                <p className="eyebrow">
                                  Complete
                                </p>

                                <h4>
                                  All equipment has
                                  been returned and
                                  verified.
                                </h4>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    )
                  }
                )}
              </div>
            )}
          </section>
        </main>

        {/* =====================================================
            CREATE REQUEST
        ====================================================== */}

        <aside className="request-create-panel">
          <div className="request-create-inner">
            <p className="eyebrow">
              New request
            </p>

            <h2>What do you need?</h2>

            <p className="request-create-copy">
              Pick a kit, choose individual
              equipment, or do both. Add one
              note and send the request.
            </p>

            <form
              onSubmit={handleCreateRequest}
            >
              <label className="request-field">
                <span>Add a kit</span>

                <select
                  value={selectedKitId}
                  onChange={(event) =>
                    handleKitChange(
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    No kit
                  </option>

                  {kits.map((kit) => (
                    <option
                      key={kit.kit_id}
                      value={kit.kit_id}
                    >
                      {kit.kit_code} ·{' '}
                      {kit.kit_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="request-field">
                <span>
                  Add specific equipment
                </span>

                <input
                  type="search"
                  value={assetSearch}
                  onChange={(event) =>
                    setAssetSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search by code, name or model"
                />
              </label>

              <div className="request-asset-picker">
                {filteredAvailableAssets.length ===
                0 ? (
                  <p className="request-picker-empty">
                    No available equipment found.
                  </p>
                ) : (
                  filteredAvailableAssets
                    .slice(0, 40)
                    .map((asset) => (
                      <label
                        key={asset.asset_id}
                        className={
                          selectedAssets.includes(
                            asset.asset_id
                          )
                            ? 'request-asset-option selected'
                            : 'request-asset-option'
                        }
                      >
                        <input
                          type="checkbox"
                          checked={selectedAssets.includes(
                            asset.asset_id
                          )}
                          onChange={() =>
                            toggleAsset(
                              asset.asset_id
                            )
                          }
                        />

                        <span>
                          <strong>
                            {asset.asset_code}
                          </strong>

                          <small>
                            {asset.name}
                          </small>
                        </span>
                      </label>
                    ))
                )}
              </div>

              <div className="request-selection-bar">
                <span>
                  {selectedAssets.length}{' '}
                  selected
                </span>

                {selectedAssets.length >
                  0 && (
                  <button
                    type="button"
                    className="request-link-button"
                    onClick={
                      clearSelectedAssets
                    }
                  >
                    Clear
                  </button>
                )}
              </div>

              <label className="request-field">
                <span>Note</span>

                <textarea
                  value={purpose}
                  onChange={(event) =>
                    setPurpose(
                      event.target.value
                    )
                  }
                  placeholder="What is this equipment needed for?"
                  rows="3"
                />
              </label>

              <div className="request-date-grid">
                <label className="request-field">
                  <span>
                    Need from
                  </span>

                  <input
                    type="date"
                    value={neededFrom}
                    onChange={(event) =>
                      setNeededFrom(
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="request-field">
                  <span>
                    Return by
                  </span>

                  <input
                    type="date"
                    value={neededUntil}
                    min={
                      neededFrom ||
                      undefined
                    }
                    onChange={(event) =>
                      setNeededUntil(
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>

              <button
                type="submit"
                className="request-submit"
                disabled={
                  creating ||
                  selectedAssets.length ===
                    0 ||
                  !neededFrom ||
                  !neededUntil ||
                  neededUntil <
                    neededFrom
                }
              >
                {creating
                  ? 'Sending…'
                  : 'Send request'}
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}
