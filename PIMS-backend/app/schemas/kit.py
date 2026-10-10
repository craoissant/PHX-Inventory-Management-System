from uuid import UUID

from pydantic import BaseModel


class KitAssetResponse(BaseModel):
    asset_id: UUID
    asset_code: str
    name: str
    asset_type: str
    status: str


class KitResponse(BaseModel):
    kit_id: UUID
    kit_code: str
    kit_name: str
    is_general: bool
    active: bool
    team_id: UUID
    team_code: str
    team_name: str
    assigned_person_id: UUID | None
    assigned_person_name: str | None
    asset_count: int
    assets: list[KitAssetResponse]


class KitDetailAssetResponse(BaseModel):
    asset_id: UUID
    asset_code: str
    name: str
    make: str | None
    model: str | None
    asset_type: str
    serial_number: str | None
    status: str
    responsible_person_id: UUID | None
    responsible_person_name: str | None
    current_possession_id: UUID | None
    current_possession_name: str | None


class KitDetailResponse(BaseModel):
    kit_id: UUID
    kit_code: str
    kit_name: str
    is_general: bool
    active: bool
    team_id: UUID
    team_code: str
    team_name: str
    assigned_person_id: UUID | None
    assigned_person_name: str | None
    assets: list[KitDetailAssetResponse]
