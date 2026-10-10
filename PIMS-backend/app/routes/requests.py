
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app.database import get_connection
from app.services.asset_handover import perform_asset_handover
from app.schemas.request import (
    AssetCheckoutDeclare,
    AssetItemDecision,
    AssetBulkDecision,
    AssetRequestCancel,
    AssetRequestCreate,
    AssetReturnVerify,
    RequestItemResponse,
    RequestResponse,
    RequestDetailItemResponse,
    RequestDetailResponse,
)


router = APIRouter(
    prefix="/api/requests",
    tags=["Requests"],
)


# ============================================================
# SHARED HELPERS
# ============================================================

def _recalculate_request_status(cursor, request_id):
    """
    Recalculate a request's parent status from its item approval
    statuses. Call this within the active database transaction.
    """

    cursor.execute(
        """
        SELECT
            COUNT(*) FILTER (
                WHERE approval_status = 'PENDING'
            ),
            COUNT(*) FILTER (
                WHERE approval_status = 'APPROVED'
            )
        FROM request_items
        WHERE request_id = %s
        """,
        (request_id,),
    )

    pending_count, approved_count = cursor.fetchone()

    if pending_count > 0:
        new_status = "PENDING"
    elif approved_count > 0:
        new_status = "APPROVED"
    else:
        new_status = "REJECTED"

    cursor.execute(
        """
        UPDATE requests
        SET
            status = %s,
            updated_at = now()
        WHERE request_id = %s
        """,
        (new_status, request_id),
    )

    return new_status


def _apply_item_decision(
    cursor,
    request_id,
    items,
    decision,
    decision_maker_id,
    notes,
):
    """
    Apply a decision to selected request items.

    When approving:
      1. Approve the selected items.
      2. Reject matching pending items in other pending requests.
      3. Recalculate every affected request status.

    Only conflicting items are rejected. Unrelated items in those
    requests remain unchanged.

    Must be called inside the caller's database transaction.
    """

    if not items:
        raise HTTPException(
            status_code=400,
            detail="No request items were selected",
        )

    selected_item_ids = [item[0] for item in items]
    selected_asset_ids = list({item[1] for item in items})

    item_placeholders = ", ".join(
        ["%s"] * len(selected_item_ids)
    )

    cursor.execute(
        f"""
        UPDATE request_items
        SET
            approval_status = %s,
            approved_by = %s,
            approved_at = now(),
            decision_notes = %s
        WHERE request_id = %s
          AND request_item_id IN ({item_placeholders})
          AND approval_status = 'PENDING'
        """,
        (
            decision,
            decision_maker_id,
            notes,
            request_id,
            *selected_item_ids,
        ),
    )

    items_decided = cursor.rowcount

    conflicting_items_rejected = 0
    conflicting_request_ids = set()

    # --------------------------------------------------------
    # Automatically reject conflicts only when approving.
    # --------------------------------------------------------

    if decision == "APPROVED":

        asset_placeholders = ", ".join(
            ["%s"] * len(selected_asset_ids)
        )

        cursor.execute(
            f"""
            SELECT
                ri.request_item_id,
                ri.request_id
            FROM request_items ri
            JOIN requests r
                ON r.request_id = ri.request_id
            WHERE ri.asset_id IN ({asset_placeholders})
              AND ri.request_id != %s
              AND ri.approval_status = 'PENDING'
              AND r.status = 'PENDING'
            ORDER BY ri.request_id, ri.request_item_id
            FOR UPDATE OF ri
            """,
            (
                *selected_asset_ids,
                request_id,
            ),
        )

        conflicting_items = cursor.fetchall()

        if conflicting_items:

            conflicting_item_ids = [
                row[0] for row in conflicting_items
            ]

            conflicting_request_ids = {
                row[1] for row in conflicting_items
            }

            conflict_placeholders = ", ".join(
                ["%s"] * len(conflicting_item_ids)
            )

            cursor.execute(
                f"""
                UPDATE request_items
                SET
                    approval_status = 'REJECTED',
                    approved_by = %s,
                    approved_at = now(),
                    decision_notes = %s
                WHERE request_item_id IN ({conflict_placeholders})
                  AND approval_status = 'PENDING'
                """,
                (
                    decision_maker_id,
                    (
                        "Automatically rejected because this asset "
                        "was approved for another request."
                    ),
                    *conflicting_item_ids,
                ),
            )

            conflicting_items_rejected = cursor.rowcount

            # Recalculate every affected request.
            for conflicting_request_id in conflicting_request_ids:
                _recalculate_request_status(
                    cursor,
                    conflicting_request_id,
                )

    # Recalculate the request that was just decided.
    new_request_status = _recalculate_request_status(
        cursor,
        request_id,
    )

    return {
        "items_decided": items_decided,
        "conflicting_items_rejected": conflicting_items_rejected,
        "request_status": new_request_status,
    }


# ============================================================
# GET ALL REQUESTS
# ============================================================

@router.get("")
def get_requests(
    current_user=Depends(get_current_user),
):
    person_id = current_user["person_id"]
    system_role = current_user["system_role"]

    with get_connection() as connection:
        with connection.cursor() as cursor:

            if system_role in {"ADMIN", "DEVELOPER"}:
                cursor.execute(
                    """
                    SELECT
                        r.request_id,
                        r.requested_by,
                        p.first_name,
                        p.last_name,
                        r.status,
                        r.purpose,
                        r.needed_from,
                        r.needed_until,
                        r.request_type,
                        r.requested_kit_id,
                        r.created_at,
                        r.updated_at
                    FROM requests r
                    JOIN people p
                        ON p.person_id = r.requested_by
                    ORDER BY r.created_at DESC
                    """
                )

            elif system_role == "USER":
                cursor.execute(
                    """
                    SELECT
                        r.request_id,
                        r.requested_by,
                        p.first_name,
                        p.last_name,
                        r.status,
                        r.purpose,
                        r.needed_from,
                        r.needed_until,
                        r.request_type,
                        r.requested_kit_id,
                        r.created_at,
                        r.updated_at
                    FROM requests r
                    JOIN people p
                        ON p.person_id = r.requested_by
                    WHERE r.requested_by = %s
                    ORDER BY r.created_at DESC
                    """,
                    (person_id,),
                )

            elif system_role == "MANAGER":
                cursor.execute(
                    """
                    SELECT
                        r.request_id,
                        r.requested_by,
                        p.first_name,
                        p.last_name,
                        r.status,
                        r.purpose,
                        r.needed_from,
                        r.needed_until,
                        r.request_type,
                        r.requested_kit_id,
                        r.created_at,
                        r.updated_at
                    FROM requests r
                    JOIN people p
                        ON p.person_id = r.requested_by
                    WHERE
                        r.requested_by = %s
                        OR EXISTS (
                            SELECT 1
                            FROM request_items ri
                            JOIN assets a
                                ON a.asset_id = ri.asset_id
                            LEFT JOIN kits k
                                ON k.kit_id = a.kit_id
                            WHERE ri.request_id = r.request_id
                              AND (
                                  a.responsible_person_id = %s
                                  OR (
                                      r.status = 'RETURN_PENDING'
                                      AND ri.item_status = 'RETURNED'
                                      AND COALESCE(k.is_general, FALSE) = TRUE
                                  )
                              )
                        )
                    ORDER BY r.created_at DESC
                    """,
                    (
                        person_id,
                        person_id,
                    ),
                )

            else:
                raise HTTPException(
                    status_code=403,
                    detail="Invalid system role",
                )

            rows = cursor.fetchall()

    return [
        {
            "request_id": row[0],
            "requested_by": row[1],
            "requester_name": f"{row[2]} {row[3]}",
            "status": row[4],
            "purpose": row[5],
            "needed_from": row[6],
            "needed_until": row[7],
            "request_type": row[8],
            "requested_kit_id": row[9],
            "created_at": row[10],
            "updated_at": row[11],
        }
        for row in rows
    ]


# ============================================================
# GET REQUEST DETAIL
# ============================================================

@router.get("/{request_id}")
def get_request(
    request_id: str,
    current_user=Depends(get_current_user),
):
    person_id = current_user["person_id"]
    system_role = current_user["system_role"]

    with get_connection() as connection:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    r.request_id,
                    r.requested_by,
                    p.first_name,
                    p.last_name,
                    r.status,
                    r.purpose,
                    r.needed_from,
                    r.needed_until,
                    r.request_type,
                    r.requested_kit_id,
                    r.decided_by,
                    r.decided_at,
                    r.decision_notes,
                    r.created_at,
                    r.updated_at
                FROM requests r
                JOIN people p
                    ON p.person_id = r.requested_by
                WHERE r.request_id = %s
                """,
                (request_id,),
            )

            request_row = cursor.fetchone()

            if not request_row:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found",
                )

            requested_by = str(request_row[1])
            request_status = request_row[4]
            person_id_str = str(person_id)

            # ------------------------------------------------
            # REQUEST VISIBILITY
            # ------------------------------------------------

            if system_role == "USER":

                if requested_by != person_id_str:
                    raise HTTPException(
                        status_code=403,
                        detail="You do not have access to this request",
                    )

            elif system_role == "MANAGER":

                if requested_by != person_id_str:
                    cursor.execute(
                        """
                        SELECT 1
                        FROM request_items ri
                        JOIN assets a
                            ON a.asset_id = ri.asset_id
                        LEFT JOIN kits k
                            ON k.kit_id = a.kit_id
                        WHERE ri.request_id = %s
                          AND (
                              a.responsible_person_id = %s
                              OR (
                                  %s = 'RETURN_PENDING'
                                  AND ri.item_status = 'RETURNED'
                                  AND COALESCE(k.is_general, FALSE) = TRUE
                              )
                          )
                        LIMIT 1
                        """,
                        (
                            request_id,
                            person_id,
                            request_status,
                        ),
                    )

                    if not cursor.fetchone():
                        raise HTTPException(
                            status_code=403,
                            detail="You do not have access to this request",
                        )

            elif system_role not in {"ADMIN", "DEVELOPER"}:
                raise HTTPException(
                    status_code=403,
                    detail="Invalid system role",
                )

            # ------------------------------------------------
            # REQUEST ITEMS
            # ------------------------------------------------

            cursor.execute(
                """
                SELECT
                    ri.request_item_id,
                    ri.asset_id,
                    a.asset_code,
                    a.name,
                    ri.item_status,
                    ri.notes,
                    ri.taken_at,
                    ri.taken_verified_by,
                    ri.taken_verified_at,
                    ri.returned_at,
                    ri.return_verified_by,
                    ri.return_verified_at,
                    ri.approval_status,
                    ri.approved_by,
                    ri.approved_at,
                    ri.decision_notes,
                    a.responsible_person_id,
                    CONCAT(
                        rp.first_name,
                        ' ',
                        rp.last_name
                    ) AS responsible_person_name
                FROM request_items ri
                JOIN assets a
                    ON a.asset_id = ri.asset_id
                LEFT JOIN people rp
                    ON rp.person_id = a.responsible_person_id
                WHERE ri.request_id = %s
                ORDER BY a.asset_code
                """,
                (request_id,),
            )

            item_rows = cursor.fetchall()

    items = [
        RequestDetailItemResponse(
            request_item_id=row[0],
            asset_id=row[1],
            asset_code=row[2],
            asset_name=row[3],
            item_status=row[4],
            notes=row[5],
            taken_at=row[6],
            taken_verified_by=row[7],
            taken_verified_at=row[8],
            returned_at=row[9],
            return_verified_by=row[10],
            return_verified_at=row[11],
            approval_status=row[12],
            approved_by=row[13],
            approved_at=row[14],
            decision_notes=row[15],
            responsible_person_id=row[16],
            responsible_person_name=row[17],
        )
        for row in item_rows
    ]

    return RequestDetailResponse(
        request_id=request_row[0],
        requested_by=request_row[1],
        requester_name=f"{request_row[2]} {request_row[3]}",
        status=request_row[4],
        purpose=request_row[5],
        needed_from=request_row[6],
        needed_until=request_row[7],
        request_type=request_row[8],
        requested_kit_id=request_row[9],
        decided_by=request_row[10],
        decided_at=request_row[11],
        decision_notes=request_row[12],
        created_at=request_row[13],
        updated_at=request_row[14],
        items=items,
    )


# ============================================================
# CREATE REQUEST
# ============================================================

@router.post(
    "",
    response_model=RequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_request(
    request: AssetRequestCreate,
    current_user=Depends(get_current_user),
):
    requester_id = current_user["person_id"]

    if not request.asset_ids:
        raise HTTPException(
            status_code=400,
            detail="Request must contain at least one asset.",
        )

    with get_connection() as connection:
        with connection.cursor() as cursor:

            # ------------------------------------------------
            # VALIDATE REQUESTED KIT
            # ------------------------------------------------

            if request.requested_kit_id:
                cursor.execute(
                    """
                    SELECT kit_id
                    FROM kits
                    WHERE kit_id = %s
                      AND active = TRUE
                    """,
                    (request.requested_kit_id,),
                )

                if not cursor.fetchone():
                    raise HTTPException(
                        status_code=400,
                        detail="Requested kit does not exist or is inactive",
                    )

            # ------------------------------------------------
            # BUILD ACTUAL REQUEST ASSET LIST
            # ------------------------------------------------

            asset_ids = set(request.asset_ids)

            if not asset_ids:
                raise HTTPException(
                    status_code=400,
                    detail="The request contains no assets.",
                )

            # ------------------------------------------------
            # VALIDATE ALL ASSETS
            # ------------------------------------------------

            placeholders = ", ".join(
                ["%s"] * len(asset_ids)
            )

            cursor.execute(
                f"""
                SELECT
                    asset_id,
                    status,
                    current_possession_id
                FROM assets
                WHERE asset_id IN ({placeholders})
                """,
                tuple(asset_ids),
            )

            assets = cursor.fetchall()

            if len(assets) != len(asset_ids):
                raise HTTPException(
                    status_code=400,
                    detail="One or more requested assets do not exist",
                )

            for asset in assets:
                asset_id = asset[0]
                current_possession_id = asset[2]

                if (
                    current_possession_id is not None
                    and str(current_possession_id) == str(requester_id)
                ):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Asset {asset_id} is already in the "
                            "requester's possession"
                        ),
                    )

            # ------------------------------------------------
            # DETERMINE REQUEST TYPE
            # ------------------------------------------------

            request_type = (
                "KIT"
                if request.requested_kit_id
                else "ASSETS"
            )

            # ------------------------------------------------
            # CREATE REQUEST
            # ------------------------------------------------

            cursor.execute(
                """
                INSERT INTO requests (
                    requested_by,
                    status,
                    purpose,
                    needed_from,
                    needed_until,
                    request_type,
                    requested_kit_id
                )
                VALUES (
                    %s,
                    'PENDING',
                    %s,
                    %s,
                    %s,
                    %s,
                    %s
                )
                RETURNING
                    request_id,
                    requested_by,
                    status,
                    purpose,
                    needed_from,
                    needed_until,
                    request_type,
                    requested_kit_id
                """,
                (
                    requester_id,
                    request.purpose,
                    request.needed_from,
                    request.needed_until,
                    request_type,
                    request.requested_kit_id,
                ),
            )

            created_request = cursor.fetchone()

            # ------------------------------------------------
            # CREATE REQUEST ITEMS
            # ------------------------------------------------

            items = []

            for asset_id in asset_ids:
                cursor.execute(
                    """
                    INSERT INTO request_items (
                        request_id,
                        asset_id,
                        item_status,
                        approval_status
                    )
                    VALUES (
                        %s,
                        %s,
                        'REQUESTED',
                        'PENDING'
                    )
                    RETURNING
                        request_item_id,
                        asset_id,
                        item_status
                    """,
                    (
                        created_request[0],
                        asset_id,
                    ),
                )

                item = cursor.fetchone()

                items.append(
                    RequestItemResponse(
                        request_item_id=item[0],
                        asset_id=item[1],
                        item_status=item[2],
                    )
                )

        connection.commit()

    return RequestResponse(
        request_id=created_request[0],
        requested_by=created_request[1],
        status=created_request[2],
        purpose=created_request[3],
        needed_from=created_request[4],
        needed_until=created_request[5],
        request_type=created_request[6],
        requested_kit_id=created_request[7],
        items=items,
    )


# ============================================================
# CANCEL REQUEST
# ============================================================

@router.post("/{request_id}/cancel")
def cancel_request(
    request_id: str,
    request: AssetRequestCancel,
    current_user=Depends(get_current_user),
):
    requester_id = current_user["person_id"]

    with get_connection() as connection:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    status,
                    requested_by
                FROM requests
                WHERE request_id = %s
                FOR UPDATE
                """,
                (request_id,),
            )

            existing_request = cursor.fetchone()

            if not existing_request:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found",
                )

            current_status = existing_request[0]
            requested_by = str(existing_request[1])

            if current_status != "PENDING":
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Only PENDING requests can be cancelled. "
                        f"Current status: {current_status}"
                    ),
                )

            if requested_by != str(requester_id):
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Only the person who created the "
                        "request can cancel it"
                    ),
                )

            cursor.execute(
                """
                UPDATE requests
                SET
                    status = 'CANCELLED',
                    decided_by = %s,
                    decided_at = now(),
                    decision_notes = %s,
                    updated_at = now()
                WHERE request_id = %s
                """,
                (
                    requester_id,
                    request.notes,
                    request_id,
                ),
            )

        connection.commit()

    return {
        "request_id": request_id,
        "status": "CANCELLED",
    }


# ============================================================
# ITEM-LEVEL APPROVAL
# ============================================================

@router.post("/{request_id}/items/{request_item_id}/decide")
def decide_request_item(
    request_id: str,
    request_item_id: str,
    request: AssetItemDecision,
    current_user=Depends(get_current_user),
):
    decision_maker_id = current_user["person_id"]
    decision_maker_id_str = str(decision_maker_id)
    decision_maker_role = current_user["system_role"]

    if decision_maker_role not in {
        "MANAGER",
        "ADMIN",
        "DEVELOPER",
    }:
        raise HTTPException(
            status_code=403,
            detail=(
                "Only managers, admins, or developers "
                "can decide request items"
            ),
        )

    if request.decision not in {"APPROVED", "REJECTED"}:
        raise HTTPException(
            status_code=400,
            detail="Decision must be APPROVED or REJECTED",
        )

    with get_connection() as connection:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    requested_by,
                    status
                FROM requests
                WHERE request_id = %s
                FOR UPDATE
                """,
                (request_id,),
            )

            existing_request = cursor.fetchone()

            if not existing_request:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found",
                )

            requested_by = str(existing_request[0])
            current_status = existing_request[1]

            if requested_by == decision_maker_id_str:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Users cannot approve or reject "
                        "their own requests"
                    ),
                )

            if current_status != "PENDING":
                raise HTTPException(
                    status_code=400,
                    detail="Only PENDING requests can be decided",
                )

            cursor.execute(
                """
                SELECT
                    ri.request_item_id,
                    ri.asset_id,
                    ri.approval_status,
                    a.status,
                    a.responsible_person_id
                FROM request_items ri
                JOIN assets a
                    ON a.asset_id = ri.asset_id
                WHERE ri.request_item_id = %s
                  AND ri.request_id = %s
                FOR UPDATE OF ri, a
                """,
                (
                    request_item_id,
                    request_id,
                ),
            )

            item = cursor.fetchone()

            if not item:
                raise HTTPException(
                    status_code=404,
                    detail="Request item not found",
                )

            approval_status = item[2]
            asset_status = item[3]
            responsible_person_id = item[4]

            if approval_status != "PENDING":
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "This request item has already been "
                        f"{approval_status.lower()}"
                    ),
                )

            if decision_maker_role == "MANAGER":
                if (
                    responsible_person_id is None
                    or str(responsible_person_id)
                    != decision_maker_id_str
                ):
                    raise HTTPException(
                        status_code=403,
                        detail=(
                            "Managers can only decide request items "
                            "for their own responsible assets"
                        ),
                    )

            if (
                request.decision == "APPROVED"
                and asset_status != "AVAILABLE"
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Asset is no longer available",
                )

            result = _apply_item_decision(
                cursor=cursor,
                request_id=request_id,
                items=[(item[0], item[1])],
                decision=request.decision,
                decision_maker_id=decision_maker_id,
                notes=request.notes,
            )

        connection.commit()

    return {
        "request_id": request_id,
        "request_item_id": request_item_id,
        "asset_id": item[1],
        "approval_status": request.decision,
        "items_decided": result["items_decided"],
        "conflicting_items_rejected": (
            result["conflicting_items_rejected"]
        ),
        "request_status": result["request_status"],
    }


# ============================================================
# DECLARE CHECKOUT
# ============================================================

@router.post("/{request_id}/checkout")
def declare_checkout(
    request_id: str,
    request: AssetCheckoutDeclare,
    current_user=Depends(get_current_user),
):
    requester_id = current_user["person_id"]

    if not request.asset_ids:
        raise HTTPException(
            status_code=400,
            detail="At least one asset must be declared as taken",
        )

    if len(request.asset_ids) != len(set(request.asset_ids)):
        raise HTTPException(
            status_code=400,
            detail="The same asset cannot be declared more than once",
        )

    with get_connection() as connection:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    requested_by,
                    status
                FROM requests
                WHERE request_id = %s
                FOR UPDATE
                """,
                (request_id,),
            )

            existing_request = cursor.fetchone()

            if not existing_request:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found",
                )

            requested_by = str(existing_request[0])
            current_status = existing_request[1]

            if requested_by != str(requester_id):
                raise HTTPException(
                    status_code=403,
                    detail="Only the requester can declare asset checkout",
                )

            if current_status not in {"APPROVED", "CHECKED_OUT"}:
                raise HTTPException(
                    status_code=400,
                    detail="Only approved requests can enter checkout",
                )

            for asset_id in request.asset_ids:
                cursor.execute(
                    """
                    SELECT
                        ri.approval_status,
                        ri.item_status,
                        a.status
                    FROM request_items ri
                    JOIN assets a
                        ON a.asset_id = ri.asset_id
                    WHERE ri.request_id = %s
                      AND ri.asset_id = %s
                    FOR UPDATE OF ri, a
                    """,
                    (
                        request_id,
                        asset_id,
                    ),
                )

                item = cursor.fetchone()

                if not item:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Asset {asset_id} does not "
                            "belong to this request"
                        ),
                    )

                approval_status = item[0]
                item_status = item[1]
                asset_status = item[2]

                if approval_status != "APPROVED":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Asset {asset_id} has not been approved",
                    )

                if item_status != "REQUESTED":
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Asset {asset_id} is not currently "
                            "eligible for checkout"
                        ),
                    )

                if asset_status != "AVAILABLE":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Asset {asset_id} is no longer available",
                    )

            for asset_id in request.asset_ids:
                perform_asset_handover(
                    cursor,
                    asset_id=asset_id,
                    to_possession_id=requested_by,
                    to_status="CHECKED_OUT",
                    performed_by=requested_by,
                    performed_role="USER",
                    reason="Request checkout",
                    notes=None,
                    allow_user_checkout=True,
                )

                cursor.execute(
                    """
                    UPDATE request_items
                    SET
                        item_status = 'TAKEN',
                        taken_at = now()
                    WHERE request_id = %s
                      AND asset_id = %s
                      AND item_status = 'REQUESTED'
                      AND approval_status = 'APPROVED'
                    """,
                    (
                        request_id,
                        asset_id,
                    ),
                )

            cursor.execute(
                """
                SELECT COUNT(*) FILTER (
                    WHERE item_status = 'TAKEN'
                )
                FROM request_items
                WHERE request_id = %s
                """,
                (request_id,),
            )

            taken_count = cursor.fetchone()[0]

            new_status = "CHECKED_OUT" if taken_count else "APPROVED"

            cursor.execute(
                """
                UPDATE requests
                SET
                    status = %s,
                    updated_at = now()
                WHERE request_id = %s
                """,
                (
                    new_status,
                    request_id,
                ),
            )

        connection.commit()

    return {
        "request_id": request_id,
        "status": new_status,
        "declared_asset_ids": request.asset_ids,
    }


# ============================================================
# DECLARE RETURN
# ============================================================

@router.post("/{request_id}/return")
def declare_return(
    request_id: str,
    request: AssetCheckoutDeclare,
    current_user=Depends(get_current_user),
):
    requester_id = current_user["person_id"]

    if not request.asset_ids:
        raise HTTPException(
            status_code=400,
            detail="At least one asset must be declared as returned",
        )

    if len(request.asset_ids) != len(set(request.asset_ids)):
        raise HTTPException(
            status_code=400,
            detail="The same asset cannot be declared more than once",
        )

    with get_connection() as connection:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    requested_by,
                    status
                FROM requests
                WHERE request_id = %s
                FOR UPDATE
                """,
                (request_id,),
            )

            existing_request = cursor.fetchone()

            if not existing_request:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found",
                )

            requested_by = str(existing_request[0])
            current_status = existing_request[1]

            if requested_by != str(requester_id):
                raise HTTPException(
                    status_code=403,
                    detail="Only the requester can declare asset return",
                )

            if current_status != "CHECKED_OUT":
                raise HTTPException(
                    status_code=400,
                    detail="Only CHECKED_OUT requests can enter return",
                )

            # Validate all assets before changing any of them.
            for asset_id in request.asset_ids:
                cursor.execute(
                    """
                    SELECT
                        ri.item_status,
                        ri.approval_status,
                        a.current_possession_id,
                        a.status
                    FROM request_items ri
                    JOIN assets a
                        ON a.asset_id = ri.asset_id
                    WHERE ri.request_id = %s
                      AND ri.asset_id = %s
                    FOR UPDATE OF ri, a
                    """,
                    (
                        request_id,
                        asset_id,
                    ),
                )

                item = cursor.fetchone()

                if not item:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Asset {asset_id} does not "
                            "belong to this request"
                        ),
                    )

                item_status = item[0]
                approval_status = item[1]
                possession_id = item[2]
                asset_status = item[3]

                if approval_status != "APPROVED":
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Asset {asset_id} was not approved "
                            "for this request"
                        ),
                    )

                if item_status != "TAKEN":
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Asset {asset_id} is not currently "
                            "eligible for return declaration"
                        ),
                    )

                if (
                    str(possession_id) != str(requester_id)
                    or asset_status != "CHECKED_OUT"
                ):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Asset {asset_id} is not currently "
                            "checked out to the requester"
                        ),
                    )

            placeholders = ", ".join(
                ["%s"] * len(request.asset_ids)
            )

            cursor.execute(
                f"""
                UPDATE request_items
                SET
                    item_status = 'RETURNED',
                    returned_at = now()
                WHERE request_id = %s
                  AND asset_id IN ({placeholders})
                  AND item_status = 'TAKEN'
                """,
                (
                    request_id,
                    *request.asset_ids,
                ),
            )

            cursor.execute(
                """
                UPDATE requests
                SET
                    status = 'RETURN_PENDING',
                    updated_at = now()
                WHERE request_id = %s
                """,
                (request_id,),
            )

        connection.commit()

    return {
        "request_id": request_id,
        "status": "RETURN_PENDING",
        "declared_asset_ids": request.asset_ids,
    }


# ============================================================
# VERIFY RETURN
# ============================================================

@router.post("/{request_id}/return/verify")
def verify_return(
    request_id: str,
    request: AssetReturnVerify,
    current_user=Depends(get_current_user),
):
    verifier_id = current_user["person_id"]
    verifier_id_str = str(verifier_id)
    verifier_role = current_user["system_role"]

    if verifier_role not in {
        "MANAGER",
        "ADMIN",
        "DEVELOPER",
    }:
        raise HTTPException(
            status_code=403,
            detail=(
                "Only managers, admins, or developers "
                "can verify returns"
            ),
        )

    if not request.asset_ids:
        raise HTTPException(
            status_code=400,
            detail="Select at least one asset to verify as returned",
        )

    if len(request.asset_ids) != len(set(request.asset_ids)):
        raise HTTPException(
            status_code=400,
            detail="The same asset cannot be verified more than once",
        )

    with get_connection() as connection:
        with connection.cursor() as cursor:

            # ------------------------------------------------
            # LOCK REQUEST
            # ------------------------------------------------

            cursor.execute(
                """
                SELECT
                    requested_by,
                    status
                FROM requests
                WHERE request_id = %s
                FOR UPDATE
                """,
                (request_id,),
            )

            existing_request = cursor.fetchone()

            if not existing_request:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found",
                )

            requested_by = str(existing_request[0])
            current_status = existing_request[1]

            if requested_by == verifier_id_str:
                raise HTTPException(
                    status_code=403,
                    detail="The requester cannot verify their own return",
                )

            if current_status != "RETURN_PENDING":
                raise HTTPException(
                    status_code=400,
                    detail="Only RETURN_PENDING requests can be verified",
                )

            # ------------------------------------------------
            # GET AND LOCK SELECTED RETURNS
            # ------------------------------------------------

            placeholders = ", ".join(
                ["%s"] * len(request.asset_ids)
            )

            cursor.execute(
                f"""
                SELECT
                    ri.asset_id,
                    ri.item_status,
                    ri.approval_status,
                    a.responsible_person_id,
                    COALESCE(k.is_general, FALSE) AS is_general
                FROM request_items ri
                JOIN assets a
                    ON a.asset_id = ri.asset_id
                LEFT JOIN kits k
                    ON k.kit_id = a.kit_id
                WHERE ri.request_id = %s
                  AND ri.asset_id IN ({placeholders})
                FOR UPDATE OF ri, a
                """,
                (
                    request_id,
                    *request.asset_ids,
                ),
            )

            items = cursor.fetchall()

            if len(items) != len(request.asset_ids):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "One or more selected assets do not "
                        "belong to this request"
                    ),
                )

            # ------------------------------------------------
            # VALIDATE SELECTED ITEMS
            # ------------------------------------------------

            for item in items:
                asset_id = item[0]
                item_status = item[1]
                approval_status = item[2]

                if approval_status != "APPROVED":
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Asset {asset_id} was not approved "
                            "for this request"
                        ),
                    )

                if item_status != "RETURNED":
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Asset {asset_id} is not currently "
                            "pending return verification"
                        ),
                    )

            # ------------------------------------------------
            # MANAGER AUTHORIZATION
            # ------------------------------------------------

            if verifier_role == "MANAGER":
                unauthorized_assets = []

                for item in items:
                    asset_id = item[0]
                    responsible_person_id = item[3]
                    is_general_kit = item[4]

                    # General-kit equipment has no fixed
                    # responsible person, so any manager
                    # can verify its return.
                    if is_general_kit:
                        continue

                    if (
                        responsible_person_id is None
                        or str(responsible_person_id)
                        != verifier_id_str
                    ):
                        unauthorized_assets.append(str(asset_id))

                if unauthorized_assets:
                    raise HTTPException(
                        status_code=403,
                        detail=(
                            "You are not authorized to verify "
                            "one or more selected assets"
                        ),
                    )

            # ------------------------------------------------
            # PROCESS SELECTED RETURNS
            # ------------------------------------------------

            for item in items:
                asset_id = item[0]
                responsible_person_id = item[3]
                is_general_kit = item[4]

                if is_general_kit:
                    return_to_person_id = verifier_id
                else:
                    if responsible_person_id is None:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"Asset {asset_id} has no "
                                "responsible person for return"
                            ),
                        )

                    return_to_person_id = responsible_person_id

                perform_asset_handover(
                    cursor,
                    asset_id=asset_id,
                    to_possession_id=return_to_person_id,
                    to_status="AVAILABLE",
                    performed_by=verifier_id,
                    performed_role=verifier_role,
                    reason="Request return",
                    notes=request.notes,
                )

                cursor.execute(
                    """
                    UPDATE request_items
                    SET
                        item_status = 'VERIFIED',
                        return_verified_by = %s,
                        return_verified_at = now()
                    WHERE request_id = %s
                      AND asset_id = %s
                      AND item_status = 'RETURNED'
                    """,
                    (
                        verifier_id,
                        request_id,
                        asset_id,
                    ),
                )

            # ------------------------------------------------
            # DETERMINE REQUEST STATUS
            # ------------------------------------------------

            cursor.execute(
                """
                SELECT
                    COUNT(*) FILTER (
                        WHERE approval_status = 'APPROVED'
                          AND item_status = 'REQUESTED'
                    ),
                    COUNT(*) FILTER (
                        WHERE item_status = 'TAKEN'
                    ),
                    COUNT(*) FILTER (
                        WHERE item_status = 'RETURNED'
                    )
                FROM request_items
                WHERE request_id = %s
                """,
                (request_id,),
            )

            (
                approved_remaining,
                taken_remaining,
                returned_remaining,
            ) = cursor.fetchone()

            if returned_remaining:
                new_status = "RETURN_PENDING"
            elif taken_remaining:
                new_status = "CHECKED_OUT"
            elif approved_remaining:
                new_status = "APPROVED"
            else:
                new_status = "COMPLETED"

            cursor.execute(
                """
                UPDATE requests
                SET
                    status = %s,
                    updated_at = now()
                WHERE request_id = %s
                """,
                (
                    new_status,
                    request_id,
                ),
            )

        connection.commit()

    return {
        "request_id": request_id,
        "status": new_status,
        "verified_asset_ids": request.asset_ids,
    }


# ============================================================
# BULK ITEM-LEVEL APPROVAL
# ============================================================

@router.post("/{request_id}/items/decide-all")
def decide_all_request_items(
    request_id: str,
    request: AssetBulkDecision,
    current_user=Depends(get_current_user),
):
    decision_maker_id = current_user["person_id"]
    decision_maker_id_str = str(decision_maker_id)
    decision_maker_role = current_user["system_role"]

    if decision_maker_role not in {
        "MANAGER",
        "ADMIN",
        "DEVELOPER",
    }:
        raise HTTPException(
            status_code=403,
            detail=(
                "Only managers, admins, or developers "
                "can decide request items"
            ),
        )

    if request.decision not in {"APPROVED", "REJECTED"}:
        raise HTTPException(
            status_code=400,
            detail="Decision must be APPROVED or REJECTED",
        )

    if not request.request_item_id:
        raise HTTPException(
            status_code=400,
            detail="Select at least one request item",
        )

    if len(request.request_item_id) != len(set(request.request_item_id)):
        raise HTTPException(
            status_code=400,
            detail="The same request item cannot be selected more than once",
        )

    with get_connection() as connection:
        with connection.cursor() as cursor:

            # ------------------------------------------------
            # LOCK REQUEST
            # ------------------------------------------------

            cursor.execute(
                """
                SELECT
                    requested_by,
                    status
                FROM requests
                WHERE request_id = %s
                FOR UPDATE
                """,
                (request_id,),
            )

            existing_request = cursor.fetchone()

            if not existing_request:
                raise HTTPException(
                    status_code=404,
                    detail="Request not found",
                )

            requested_by = str(existing_request[0])
            current_status = existing_request[1]

            if requested_by == decision_maker_id_str:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Users cannot approve or reject "
                        "their own requests"
                    ),
                )

            if current_status != "PENDING":
                raise HTTPException(
                    status_code=400,
                    detail="Only PENDING requests can be decided",
                )

            # ------------------------------------------------
            # FETCH AND LOCK SELECTED ITEMS
            # ------------------------------------------------

            placeholders = ", ".join(
                ["%s"] * len(request.request_item_id)
            )

            if decision_maker_role in {"ADMIN", "DEVELOPER"}:
                cursor.execute(
                    f"""
                    SELECT
                        ri.request_item_id,
                        ri.asset_id,
                        ri.approval_status,
                        a.status
                    FROM request_items ri
                    JOIN assets a
                        ON a.asset_id = ri.asset_id
                    WHERE ri.request_id = %s
                      AND ri.request_item_id IN ({placeholders})
                    FOR UPDATE OF ri, a
                    """,
                    (
                        request_id,
                        *request.request_item_id,
                    ),
                )

            else:
                cursor.execute(
                    f"""
                    SELECT
                        ri.request_item_id,
                        ri.asset_id,
                        ri.approval_status,
                        a.status
                    FROM request_items ri
                    JOIN assets a
                        ON a.asset_id = ri.asset_id
                    WHERE ri.request_id = %s
                      AND ri.request_item_id IN ({placeholders})
                      AND a.responsible_person_id = %s
                    FOR UPDATE OF ri, a
                    """,
                    (
                        request_id,
                        *request.request_item_id,
                        decision_maker_id,
                    ),
                )

            rows = cursor.fetchall()

            if len(rows) != len(request.request_item_id):
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "One or more selected request items "
                        "are not available for your decision"
                    ),
                )

            # ------------------------------------------------
            # VALIDATE ALL SELECTED ITEMS BEFORE CHANGING THEM
            # ------------------------------------------------

            for item in rows:
                request_item_id = item[0]
                approval_status = item[2]
                asset_status = item[3]

                if approval_status != "PENDING":
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Request item {request_item_id} has "
                            f"already been {approval_status.lower()}"
                        ),
                    )

                if (
                    request.decision == "APPROVED"
                    and asset_status != "AVAILABLE"
                ):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "One or more selected assets "
                            "are no longer available"
                        ),
                    )

            # ------------------------------------------------
            # APPLY DECISION AND RESOLVE CONFLICTS
            # ------------------------------------------------

            result = _apply_item_decision(
                cursor=cursor,
                request_id=request_id,
                items=[
                    (item[0], item[1])
                    for item in rows
                ],
                decision=request.decision,
                decision_maker_id=decision_maker_id,
                notes=request.notes,
            )

        connection.commit()

    return {
        "request_id": request_id,
        "decision": request.decision,
        "items_decided": result["items_decided"],
        "conflicting_items_rejected": (
            result["conflicting_items_rejected"]
        ),
        "request_status": result["request_status"],
    }
