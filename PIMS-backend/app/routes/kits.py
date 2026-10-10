from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID

from app.auth import get_current_user
from app.database import get_connection
from app.schemas.kit import (
    KitAssetResponse,
    KitDetailAssetResponse,
    KitDetailResponse,
    KitResponse,
)


router = APIRouter(
    prefix="/api/kits",
    tags=["Kits"],
)



@router.get("/{kit_id}", response_model=KitDetailResponse)
def get_kit(
    kit_id: UUID,
    current_user=Depends(get_current_user),
):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    k.kit_id, k.kit_code, k.kit_name,
                    k.is_general, k.active, k.team_id,
                    t.team_code, t.team_name,
                    k.assigned_person_id,
                    CONCAT(p.first_name, ' ', p.last_name)
                FROM kits k
                JOIN teams t ON t.team_id = k.team_id
                LEFT JOIN people p ON p.person_id = k.assigned_person_id
                WHERE k.kit_id = %s
                """,
                (kit_id,),
            )
            kit = cursor.fetchone()

            if not kit:
                raise HTTPException(status_code=404, detail="Kit not found")

            cursor.execute(
                """
                SELECT
                    a.asset_id, a.asset_code, a.name, a.make, a.model,
                    a.asset_type, a.serial_number, a.status,
                    a.responsible_person_id,
                    CONCAT(rp.first_name, ' ', rp.last_name),
                    a.current_possession_id,
                    CONCAT(cp.first_name, ' ', cp.last_name)
                FROM assets a
                LEFT JOIN people rp ON rp.person_id = a.responsible_person_id
                LEFT JOIN people cp ON cp.person_id = a.current_possession_id
                WHERE a.kit_id = %s
                ORDER BY a.asset_code
                """,
                (kit_id,),
            )
            asset_rows = cursor.fetchall()

    assets = [
        KitDetailAssetResponse(
            asset_id=row[0], asset_code=row[1], name=row[2],
            make=row[3], model=row[4], asset_type=row[5],
            serial_number=row[6], status=row[7],
            responsible_person_id=row[8],
            responsible_person_name=row[9],
            current_possession_id=row[10],
            current_possession_name=row[11],
        )
        for row in asset_rows
    ]

    return KitDetailResponse(
        kit_id=kit[0], kit_code=kit[1], kit_name=kit[2],
        is_general=kit[3], active=kit[4], team_id=kit[5],
        team_code=kit[6], team_name=kit[7],
        assigned_person_id=kit[8], assigned_person_name=kit[9],
        assets=assets,
    )

@router.get("", response_model=list[KitResponse])
def get_kits(current_user=Depends(get_current_user)):
    with get_connection() as connection:
        with connection.cursor() as cursor:

            cursor.execute(
    """
    SELECT
        k.kit_id,
        k.kit_code,
        k.kit_name,
        k.is_general,
        k.active,

        k.team_id,
        t.team_code,
        t.team_name,

        k.assigned_person_id,
        CONCAT(
            p.first_name,
            ' ',
            p.last_name
        ) AS assigned_person_name,

        COUNT(a.asset_id) AS asset_count
    FROM kits k
    JOIN teams t
        ON t.team_id = k.team_id
    LEFT JOIN people p
        ON p.person_id = k.assigned_person_id
    LEFT JOIN assets a
        ON a.kit_id = k.kit_id
    GROUP BY
        k.kit_id,
        k.kit_code,
        k.kit_name,
        k.is_general,
        k.active,
        k.team_id,
        t.team_code,
        t.team_name,
        k.assigned_person_id,
        p.first_name,
        p.last_name
    ORDER BY k.kit_code
    """
)

            kit_rows = cursor.fetchall()

            kits = []

            for kit in kit_rows:
                cursor.execute(
                    """
                    SELECT
                        asset_id,
                        asset_code,
                        name,
                        asset_type,
                        status
                    FROM assets
                    WHERE kit_id = %s
                    ORDER BY asset_code
                    """,
                    (kit[0],),
                )

                asset_rows = cursor.fetchall()

                assets = [
                    KitAssetResponse(
                        asset_id=row[0],
                        asset_code=row[1],
                        name=row[2],
                        asset_type=row[3],
                        status=row[4],
                    )
                    for row in asset_rows
                ]

                kits.append(
                    KitResponse(
                        kit_id=kit[0],
                        kit_code=kit[1],
                        kit_name=kit[2],
                        is_general=kit[3],
                        active=kit[4],
                        team_id=kit[5],
                        team_code=kit[6],
                        team_name=kit[7],
                        assigned_person_id=kit[8],
                        assigned_person_name=kit[9],
                        asset_count=kit[10],
                        assets=assets,
)
                )

    return kits