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
):
    if performed_role not in {"MANAGER", "ADMIN", "DEVELOPER"}:
        if not (
            performed_role == "USER"
            and allow_user_checkout
            and to_status == "CHECKED_OUT"
        ):
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to handover assets",
            )

    if to_status not in {
        "AVAILABLE",
        "CHECKED_OUT",
        "BORROWED",
    }:
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

    from_possession_id = asset[0]
    from_status = asset[1]
    responsible_person_id = asset[2]

    # Managers can only handover their own responsible assets.
    if (
        performed_role == "MANAGER"
        and str(responsible_person_id) != performed_by
    ):
        raise HTTPException(
            status_code=403,
            detail="Managers can only handover their own assets",
        )

    if performed_role == "USER" and allow_user_checkout:
        if from_status != "AVAILABLE":
            raise HTTPException(
                status_code=400,
                detail="Only available assets can be checked out",
            )
        if str(to_possession_id) != str(performed_by):
            raise HTTPException(
                status_code=403,
                detail="You can only check out an asset to yourself",
            )

    # A normal handover requires an existing physical holder.
    if from_possession_id is None and not (
        performed_role == "USER" and allow_user_checkout
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Asset has no current possession holder. "
                "Use an assignment operation instead of handover"
            ),
        )

    # Receiving person must be active.
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

    # Prevent meaningless handovers.
    if str(from_possession_id) == str(to_possession_id):
        raise HTTPException(
            status_code=400,
            detail="Asset is already in the possession of this person",
        )

    # Prevent meaningless status transitions.
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

    # Record the physical event.
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
            %s,
            'HANDOVER',
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s
        )
        RETURNING movement_id
        """,
        (
            asset_id,
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