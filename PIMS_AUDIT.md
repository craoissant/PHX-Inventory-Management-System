# PIMS Audit & Remediation

## Scope

Audited the uploaded PIMS repository as supplied. The audit covered the React/Vite frontend, FastAPI backend, request lifecycle, asset/kit presentation, possession/handover logic, API boundaries, and frontend/backend consistency.

The uploaded repository did **not** contain database migrations/schema/RLS policy definitions, so database/RLS correctness could only be assessed from application code. No production database changes were made.

## Changes made

### Critical / high

- Fixed request checkout calling the handover service as `USER` even though the service rejected users.
  - Added a narrowly scoped `allow_user_checkout` path.
  - Users can only use that path for an approved request checkout, to themselves, with an available asset.
  - The generic management handover operation remains restricted.

- Removed the obsolete second checkout-verification workflow from the Requests UI.
  - The requester declaration now performs the physical possession update.
  - Removed `CHECKOUT_PENDING` UI handling and `handleVerifyCheckout`.

- Fixed partial checkout state handling.
  - A request can remain in active use while some approved items are still awaiting checkout.
  - Remaining approved items can subsequently be taken.
  - The request only becomes `CHECKED_OUT` once at least one item is taken and remains in use until all taken items are returned/verified.

- Fixed partial return completion logic.
  - After return verification, the request now correctly resolves to `APPROVED`, `CHECKED_OUT`, or `COMPLETED` depending on remaining approved/taken items.

- Fixed kit requests not being represented as kit requests.
  - The frontend now sends `requested_kit_id`.
  - The backend already derives `KIT`, `ASSETS`, or `KIT_AND_ASSETS` from the submitted data.

- Fixed kit-request creation rejecting a whole kit merely because one of its assets is currently unavailable.
  - Availability remains an approval-time constraint.
  - This allows a request to represent the complete kit without silently dropping unavailable kit items.

- Made bulk approval safer.
  - "Approve all" now approves only currently available eligible items.
  - Unavailable items remain pending rather than causing the entire bulk operation to fail.

### Kit system

- Fixed the "all kits are unassigned" display bug.
  - Backend returns `assigned_person_name`.
  - Frontend was incorrectly expecting a nested `assigned_person` object.

- Added authenticated `GET /api/kits/{kit_id}`.
  - Kit Details no longer queries Supabase directly.
  - The page now uses the same FastAPI boundary as the kit list.

- Added complete kit-detail asset data to the API:
  - make/model
  - serial number
  - status
  - responsible person
  - current possession

- Added missing Kit Details styling.
  - The page now has a structured header, summary, status summary, readable asset table, empty state, and responsive behavior.

### Asset system

- Simplified Asset Details into an inspection page.
  - Removed status-changing UI.
  - Removed direct handover UI.
  - Removed direct kit-transfer UI.
  - Removed direct Supabase RPC calls for asset operations.

- Asset Details now reads through FastAPI.
  - Asset data comes from `/api/assets`.
  - Movement history comes from `/api/assets/{asset_id}/movements`.

- Added a clear read-only asset presentation with:
  - identity
  - status
  - team
  - kit
  - responsible person
  - current possession
  - serial number
  - notes
  - movement history

- Added `updated_at` to the asset API response so the details page can display it.

### Requests UI

- Removed obsolete checkout-verification controls.
- Updated checkout confirmation wording to reflect the actual workflow.
- Kept the request lifecycle focused on:
  - request
  - approval
  - user declares taken items
  - user declares returned items
  - authorized manager verifies return

- Kit request creation now correctly records the selected kit.

## Architectural findings

### Existing split API architecture

Several pages still use Supabase directly while other pages use FastAPI. This remains in:
- authentication/session handling
- People
- Dashboard
- RLS test page

The Kit Details and Asset Details paths were removed from that split because those pages were performing application/business operations directly against Supabase.

This should be considered remaining architectural debt rather than something to rewrite indiscriminately.

### Handover boundary

`asset_handover.py` is now used as the business-operation boundary for the request checkout path. The generic management handover endpoint remains separate.

A future improvement would be to formalize asset state transitions in one explicit state-machine/service rather than allowing multiple route-specific status rules.

## Security findings

- Request visibility is server-side restricted:
  - USER: own requests
  - MANAGER: requests involving their responsible assets
  - ADMIN/DEVELOPER: broader access

- Request item decisions are server-side authorized.
- Manager approval is restricted to assets for which the manager is responsible.
- User checkout is narrowly restricted to the requester and approved request items.
- Return verification prevents the requester from verifying their own return.
- Manager return verification is restricted to their responsible assets.

### Remaining security audit limitation

No database schema/RLS/policy files were included in the uploaded repository. Therefore the Supabase RLS layer and SECURITY DEFINER RPC definitions could not be fully audited.

## Validation

### Passed

- Python backend `compileall`
- JSX/JavaScript parsing for every frontend source file using Babel parser

### Frontend build limitation

`npm run build` could not be completed in the supplied environment because the archived `node_modules` is missing the platform-specific native Rolldown binding. An `npm install` attempt timed out.

This is an environment/dependency-installation limitation, not a reported source syntax failure.

## Remaining issues / decisions

1. Database/RLS policies need a schema/policy dump for a complete security audit.
2. The repository still contains direct Supabase reads in several non-remediated pages.
3. The generic asset status/handover APIs still permit several status values whose complete transition policy is not formally centralized.
4. General-kit possession semantics deserve an explicit business rule: after a general-kit asset is returned and verified, whether `current_possession_id` should become NULL or remain associated with a responsible physical holder.
5. No destructive production database changes were made.

## Design principle used

The remediation deliberately avoids a broad rewrite. Existing business behavior was preserved wherever it was reasonably established, while confirmed bugs, duplicated operational paths, and obsolete request workflow pieces were corrected.
