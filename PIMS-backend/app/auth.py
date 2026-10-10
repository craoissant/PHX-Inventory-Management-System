import os
from uuid import UUID

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database import get_connection


load_dotenv()


SUPABASE_URL = os.getenv("SUPABASE_URL")

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is not set in the .env file")


SUPABASE_ISSUER = f"{SUPABASE_URL}/auth/v1"
SUPABASE_JWKS_URL = f"{SUPABASE_ISSUER}/.well-known/jwks.json"


security = HTTPBearer()

_jwks_client = jwt.PyJWKClient(SUPABASE_JWKS_URL)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials
    print("AUTH: token received")

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            issuer=SUPABASE_ISSUER,
            audience="authenticated",
        )

    except jwt.PyJWTError as error:
        print("JWT validation error:", type(error).__name__, str(error))

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
        )

    auth_user_id = payload.get("sub")

    if not auth_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has no user ID",
        )

    try:
        auth_user_uuid = UUID(auth_user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in authentication token",
        )

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    person_id,
                    first_name,
                    last_name,
                    system_role,
                    team_id
                FROM people
                WHERE auth_user_id = %s
                  AND active = TRUE
                """,
                (auth_user_uuid,),
            )

            person = cursor.fetchone()

    if not person:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated user is not a PIMS user",
        )

    return {
        "person_id": str(person[0]),
        "first_name": person[1],
        "last_name": person[2],
        "system_role": person[3],
        "team_id": str(person[4]) if person[4] else None,
    }


def require_role(*allowed_roles):
    def role_checker(current_user=Depends(get_current_user)):
        if current_user["system_role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )

        return current_user

    return role_checker