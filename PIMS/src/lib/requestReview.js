export function canReviewRequests(person) {
  return ['MANAGER', 'ADMIN', 'DEVELOPER'].includes(person?.system_role)
}

export function canDecideItem(person, request, item) {
  return canReviewRequests(person) &&
    request.requested_by !== person.person_id &&
    request.status === 'PENDING' &&
    item.approval_status === 'PENDING' &&
    (person.system_role !== 'MANAGER' || item.responsible_person_id === person.person_id)
}

export function getVerifiableReturnItems(person, request) {
  if (!canReviewRequests(person) || request.requested_by === person.person_id ||
      request.status !== 'RETURN_PENDING') return []

  return request.items.filter((item) =>
    item.item_status === 'RETURNED' &&
    item.approval_status === 'APPROVED' &&
    (person.system_role !== 'MANAGER' ||
      item.responsible_person_id === person.person_id ||
      !item.responsible_person_id)
  )
}

export function getApprovalQueues(person, requests) {
  return {
    pending: requests.filter((request) =>
      request.items.some((item) => canDecideItem(person, request, item))
    ),
    returns: requests.filter((request) => getVerifiableReturnItems(person, request).length > 0),
  }
}
