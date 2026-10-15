
from uuid import UUID

from fastapi import HTTPException


def perform_asset_handover(
    cursor,
    *,
    asset_id: UUID,
    to_possession_id: UUID,
    to_status: str,
    performed_by: str,
    performed_role: str,
    reason: str | None = None,
    notes: str | None = None,
    allow_user_checkout: bool = False,
    allow_direct_checkout: bool = False,
):
    # Validate the operation's permission mode.
    if allow_user_checkout and allow_direct_checkout:
        raise HTTPException(
            status_code=400,
            detail="Checkout permission modes cannot be combined",
        )

    # Direct checkout is restricted to managers and above.
    if allow_direct_checkout:
        if performed_role not in {"MANAGER", "ADMIN", "DEVELOPER"}:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission for direct checkout",
            )

        if to_status != "CHECKED_OUT":
            raise HTTPException(
                status_code=400,
                detail="Direct checkout must use CHECKED_OUT status",
            )

        if str(to_possession_id) != str(performed_by):
            raise HTTPException(
                status_code=403,
                detail="You can only check out assets to yourself",
            )

    # Users may only perform explicitly permitted request checkouts.
    if performed_role == "USER":
        if not allow_user_checkout or to_status != "CHECKED_OUT":
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to handover assets",
            )

        if str(to_possession_id) != str(performed_by):
            raise HTTPException(
                status_code=403,
                detail="You can only check out assets to yourself",
            )

    elif performed_role not in {"MANAGER", "ADMIN", "DEVELOPER"}:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to handover assets",
        )

    # Validate the requested destination status.
    if to_status not in {"AVAILABLE", "CHECKED_OUT", "BORROWED"}:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid handover status: {to_status}",
        )

    # Lock the asset and capture its current state.
    cursor.execute(
        """
        SELECT
            current_possession_id,
            status,
            responsible_person_id
        FROM assets
        WHERE asset_id = %s
        FOR UPDATE
        """,
        (asset_id,),
    )

    asset = cursor.fetchone()

    if not asset:
        raise HTTPException(
            status_code=404,
            detail="Asset not found",
        )

    from_possession_id, from_status, responsible_person_id = asset

    # Managers may only operate on their responsible assets.
    if (
        performed_role == "MANAGER"
        and str(responsible_person_id) != str(performed_by)
    ):
        raise HTTPException(
            status_code=403,
            detail="Managers can only handover their own assets",
        )

    # Checkout is only permitted for available assets.
    if allow_user_checkout or allow_direct_checkout:
        if from_status != "AVAILABLE":
            raise HTTPException(
                status_code=400,
                detail="Only available assets can be checked out",
            )

    # A normal handover requires an existing physical holder.
    if from_possession_id is None:
        if not (allow_user_checkout or allow_direct_checkout):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Asset has no current possession holder. "
                    "Use an assignment operation instead of handover"
                ),
            )

    # The receiving person must be active.
    cursor.execute(
        """
        SELECT 1
        FROM people
        WHERE person_id = %s
          AND active = TRUE
        """,
        (to_possession_id,),
    )

    if not cursor.fetchone():
        raise HTTPException(
            status_code=400,
            detail="Receiving person is not active",
        )

    # Prevent meaningless handovers and status transitions.
    if (
        from_possession_id is not None
        and str(from_possession_id) == str(to_possession_id)
        and not allow_direct_checkout
    ):
        raise HTTPException(
            status_code=400,
            detail="Asset is already in the possession of this person",
        )

    if from_status == to_status:
        raise HTTPException(
            status_code=400,
            detail=f"Asset is already in status {to_status}",
        )

    # Update possession and status atomically.
    cursor.execute(
        """
        UPDATE assets
        SET
            current_possession_id = %s,
            status = %s,
            updated_at = now()
        WHERE asset_id = %s
        """,
        (
            to_possession_id,
            to_status,
            asset_id,
        ),
    )

    # An available asset being checked out is an assignment.
    # A transfer from an existing holder is a handover.
    is_checkout_assignment = (
        from_status == "AVAILABLE"
        and to_status == "CHECKED_OUT"
    )

    movement_type = (
        "ASSIGNMENT"
        if is_checkout_assignment
        else "HANDOVER"
    )

    cursor.execute(
        """
        INSERT INTO asset_movements (
            asset_id,
            movement_type,
            from_possession_id,
            to_possession_id,
            from_status,
            to_status,
            reason,
            performed_by,
            notes
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        RETURNING movement_id
        """,
        (
            asset_id,
            movement_type,
            from_possession_id,
            to_possession_id,
            from_status,
            to_status,
            reason,
            performed_by,
            notes,
        ),
    )

    movement_id = cursor.fetchone()[0]

    return {
        "movement_id": movement_id,
        "from_possession_id": from_possession_id,
        "to_possession_id": to_possession_id,
        "from_status": from_status,
        "to_status": to_status,
    }
