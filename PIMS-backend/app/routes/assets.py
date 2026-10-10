from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.database import get_connection
from app.schemas.asset import (
    AssetHandoverRequest,
    AssetMovementResponse,
    AssetResponse,
    AssetStatusChangeRequest,
)
from app.services.asset_handover import perform_asset_handover


router = APIRouter(
    prefix="/api/assets",
    tags=["Assets"],
)


@router.get("", response_model=list[AssetResponse])
def get_assets(current_user=Depends(get_current_user)):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    a.asset_id,
                    a.asset_code,
                    a.name,
                    a.make,
                    a.model,
                    a.asset_type,
                    a.serial_number,

                    a.team_id,
                    t.team_code,
                    t.team_name,

                    a.kit_id,
                    k.kit_code,
                    k.kit_name,

                    a.responsible_person_id,
                    CONCAT(rp.first_name, ' ', rp.last_name),

                    a.current_possession_id,
                    CONCAT(cp.first_name, ' ', cp.last_name),

                    a.status,
                    a.notes,
                    a.updated_at
                FROM assets a
                JOIN teams t
                    ON t.team_id = a.team_id
                JOIN kits k
                    ON k.kit_id = a.kit_id
                LEFT JOIN people rp
                    ON rp.person_id = a.responsible_person_id
                LEFT JOIN people cp
                    ON cp.person_id = a.current_possession_id
                ORDER BY a.asset_code
                """
            )

            rows = cursor.fetchall()

    return [
        AssetResponse(
            asset_id=row[0],
            asset_code=row[1],
            name=row[2],
            make=row[3],
            model=row[4],
            asset_type=row[5],
            serial_number=row[6],
            team_id=row[7],
            team_code=row[8],
            team_name=row[9],
            kit_id=row[10],
            kit_code=row[11],
            kit_name=row[12],
            responsible_person_id=row[13],
            responsible_person_name=row[14],
            current_possession_id=row[15],
            current_possession_name=row[16],
            status=row[17],
            notes=row[18],
            updated_at=row[19],
        )
        for row in rows
    ]

@router.get(
    "/{asset_id}/movements",
    response_model=list[AssetMovementResponse],
)
def get_asset_movements(
    asset_id: str,
    current_user=Depends(get_current_user),
):
    with get_connection() as connection:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT 1
                FROM assets
                WHERE asset_id = %s
                """,
                (asset_id,),
            )

            if not cursor.fetchone():
                raise HTTPException(
                    status_code=404,
                    detail="Asset not found",
                )

            cursor.execute(
                """
                SELECT
                    movement_id,
                    asset_id,
                    movement_type,
                    from_kit_id,
                    to_kit_id,
                    from_responsible_person_id,
                    to_responsible_person_id,
                    from_possession_id,
                    to_possession_id,
                    from_status,
                    to_status,
                    reason,
                    performed_by,
                    notes,
                    created_at
                FROM asset_movements
                WHERE asset_id = %s
                ORDER BY created_at DESC
                """,
                (asset_id,),
            )

            rows = cursor.fetchall()

    return [
        AssetMovementResponse(
            movement_id=row[0],
            asset_id=row[1],
            movement_type=row[2],
            from_kit_id=row[3],
            to_kit_id=row[4],
            from_responsible_person_id=row[5],
            to_responsible_person_id=row[6],
            from_possession_id=row[7],
            to_possession_id=row[8],
            from_status=row[9],
            to_status=row[10],
            reason=row[11],
            performed_by=row[12],
            notes=row[13],
            created_at=row[14],
        )
        for row in rows
    ]

@router.post("/{asset_id}/handover")
def handover_asset(
    asset_id: str,
    request: AssetHandoverRequest,
    current_user=Depends(get_current_user),
):
    with get_connection() as connection:
        with connection.cursor() as cursor:

            result = perform_asset_handover(
                cursor,
                asset_id=asset_id,
                to_possession_id=request.to_possession_id,
                to_status=request.to_status,
                performed_by=current_user["person_id"],
                performed_role=current_user["system_role"],
                reason=request.reason,
                notes=request.notes,
            )

        connection.commit()

    return {
        "movement_id": result["movement_id"],
        "asset_id": asset_id,
        "status": result["to_status"],
    }

@router.post("/{asset_id}/status")
def change_asset_status(
    asset_id: str,
    request: AssetStatusChangeRequest,
    current_user=Depends(get_current_user),
):
    performed_by = current_user["person_id"]
    performed_role = current_user["system_role"]

    if performed_role not in {"MANAGER", "ADMIN", "DEVELOPER"}:
        raise HTTPException(
            status_code=403,
            detail=(
                "Only managers, admins, or developers "
                "can change asset status"
            ),
        )

    valid_statuses = {
        "AVAILABLE",
        "CHECKED_OUT",
        "BORROWED",
        "IN_SERVICE",
        "DAMAGED",
        "MISSING",
        "LOST",
        "RETIRED",
    }

    if request.to_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid asset status: {request.to_status}",
        )

    with get_connection() as connection:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
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

            from_status = asset[0]
            responsible_person_id = asset[1]

            if (
                performed_role == "MANAGER"
                and str(responsible_person_id) != performed_by
            ):
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Managers can only change the status "
                        "of their own assets"
                    ),
                )

            if from_status == request.to_status:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Asset is already in status "
                        f"{request.to_status}"
                    ),
                )

            cursor.execute(
                """
                UPDATE assets
                SET
                    status = %s,
                    updated_at = now()
                WHERE asset_id = %s
                """,
                (
                    request.to_status,
                    asset_id,
                ),
            )

            cursor.execute(
                """
                INSERT INTO asset_movements (
                    asset_id,
                    movement_type,
                    from_status,
                    to_status,
                    reason,
                    performed_by,
                    notes
                )
                VALUES (
                    %s,
                    'STATUS_CHANGE',
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
                    from_status,
                    request.to_status,
                    request.reason,
                    performed_by,
                    request.notes,
                ),
            )

            movement_id = cursor.fetchone()[0]

        connection.commit()

    return {
        "movement_id": movement_id,
        "asset_id": asset_id,
        "status": request.to_status,
    }