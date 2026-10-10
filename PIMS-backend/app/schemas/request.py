
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AssetRequestCreate(BaseModel):
    asset_ids: list[UUID] = Field(default_factory=list)
    requested_kit_id: UUID | None = None
    purpose: str | None = None
    needed_from: datetime | None = None
    needed_until: datetime | None = None


class RequestItemResponse(BaseModel):
    request_item_id: UUID
    asset_id: UUID
    item_status: str


class RequestResponse(BaseModel):
    request_id: UUID
    requested_by: UUID
    status: str
    purpose: str | None
    needed_from: datetime | None
    needed_until: datetime | None
    request_type: str
    requested_kit_id: UUID | None

    items: list[RequestItemResponse]


class AssetRequestCancel(BaseModel):
    notes: str | None = None


class AssetItemDecision(BaseModel):
    decision: str
    notes: str | None = None


class AssetCheckoutDeclare(BaseModel):
    asset_ids: list[UUID] = Field(default_factory=list)

class AssetBulkDecision(BaseModel):
    decision: str
    item_ids: list[UUID] = Field(default_factory=list)
    request_item_id: list[str]
    notes: str | None = None


class RequestDetailItemResponse(BaseModel):
    request_item_id: UUID
    asset_id: UUID

    asset_code: str
    asset_name: str

    item_status: str
    notes: str | None

    # Physical checkout lifecycle
    taken_at: datetime | None
    taken_verified_by: UUID | None
    taken_verified_at: datetime | None

    # Physical return lifecycle
    returned_at: datetime | None
    return_verified_by: UUID | None
    return_verified_at: datetime | None

    # Item-level approval lifecycle
    approval_status: str
    approved_by: UUID | None
    approved_at: datetime | None
    decision_notes: str | None

    # Asset responsibility
    responsible_person_id: UUID | None
    responsible_person_name: str | None


class RequestDetailResponse(BaseModel):
    request_id: UUID

    requested_by: UUID
    requester_name: str

    status: str

    purpose: str | None

    needed_from: datetime | None
    needed_until: datetime | None

    request_type: str
    requested_kit_id: UUID | None

    # Legacy request-level decision fields.
    # These remain because they exist in the database
    # and are used by historical requests.
    decided_by: UUID | None
    decided_at: datetime | None
    decision_notes: str | None

    created_at: datetime
    updated_at: datetime

    items: list[RequestDetailItemResponse]


class AssetReturnVerify(BaseModel):
    asset_ids: list[UUID] = Field(default_factory=list)
    notes: str | None = None
