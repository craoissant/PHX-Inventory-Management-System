from uuid import UUID

from pydantic import BaseModel


class PersonResponse(BaseModel):
    person_id: UUID
    first_name: str
    last_name: str
    email: str
    phone: str | None
    team_id: UUID
    team_code: str
    team_name: str
    active: bool
    system_role: str