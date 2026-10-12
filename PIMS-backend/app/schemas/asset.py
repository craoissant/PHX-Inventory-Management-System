from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class AssetResponse(BaseModel):
    asset_id: UUID
    asset_code: str
    name: str
    make: str | None
    model: str | None
    asset_type: str
    serial_number: str | None

    team_id: UUID
    team_code: str
    team_name: str

    kit_id: UUID
    kit_code: str
    kit_name: str

    responsible_person_id: UUID | None
    responsible_person_name: str | None

    current_possession_id: UUID | None
    current_possession_name: str | None

    status: str
    notes: str | None
    updated_at: datetime | None


class AssetHandoverRequest(BaseModel):
    to_possession_id: UUID
    to_status: str
    reason: str | None = None
    notes: str | None = None

class AssetStatusChangeRequest(BaseModel):
    to_status: str
    reason: str | None = None
    notes: str | None = None


class AssetMovementResponse(BaseModel):
    movement_id: UUID
    asset_id: UUID
    movement_type: str

    from_kit_id: UUID | None
    to_kit_id: UUID | None

    from_responsible_person_id: UUID | None
    to_responsible_person_id: UUID | None

    from_possession_id: UUID | None
    to_possession_id: UUID | None

    from_status: str | None
    to_status: str | None

    reason: str | None
    performed_by: UUID | None
    notes: str | None
    created_at: datetime

class DirectCheckoutRequest(BaseModel):
    asset_ids: list[UUID]
    notes: str | None = None


