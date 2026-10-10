from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.database import get_connection
from app.schemas.person import PersonResponse


router = APIRouter(
    prefix="/api/people",
    tags=["People"],
)


@router.get("", response_model=list[PersonResponse])
def get_people(current_user=Depends(get_current_user)):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    p.person_id,
                    p.first_name,
                    p.last_name,
                    p.email,
                    p.phone,
                    p.team_id,
                    t.team_code,
                    t.team_name,
                    p.active,
                    p.system_role
                FROM people p
                JOIN teams t
                    ON t.team_id = p.team_id
                ORDER BY
                    p.first_name,
                    p.last_name
                """
            )

            rows = cursor.fetchall()

    return [
        PersonResponse(
            person_id=row[0],
            first_name=row[1],
            last_name=row[2],
            email=row[3],
            phone=row[4],
            team_id=row[5],
            team_code=row[6],
            team_name=row[7],
            active=row[8],
            system_role=row[9],
        )
        for row in rows
    ]