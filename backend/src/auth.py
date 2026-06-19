"""
Google OAuth verification + JWT issuance.

Flow:
  1. Frontend calls Google Sign-In → receives an ID token (credential)
  2. Frontend POSTs that token to POST /auth/google
  3. This module verifies the token with Google's public keys
  4. We issue a short-lived JWT stored in the browser's sessionStorage
     (sessionStorage survives page refresh but is cleared on tab/window close)
"""

import datetime
import logging

import jwt
from google.auth.transport import requests as g_requests
from google.oauth2 import id_token

from src.config import GOOGLE_CLIENT_ID, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS

logger = logging.getLogger(__name__)

_google_request = g_requests.Request()


def verify_google_token(credential: str) -> dict:
    """
    Verify a Google ID token and return the decoded user info.
    Raises ValueError on invalid / expired tokens.
    """
    if not GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID is not configured. Add it to .env.")

    try:
        idinfo = id_token.verify_oauth2_token(credential, _google_request, GOOGLE_CLIENT_ID)
    except Exception as e:
        raise ValueError(f"Invalid Google token: {e}") from e

    return {
        "google_id": idinfo["sub"],
        "email": idinfo["email"],
        "name": idinfo.get("name", ""),
        "picture": idinfo.get("picture", ""),
    }


def create_jwt(user_info: dict) -> str:
    """Issue a JWT containing user identity, expiring after JWT_EXPIRE_HOURS."""
    payload = {
        **user_info,
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    """Decode and verify a JWT. Raises jwt.ExpiredSignatureError / jwt.InvalidTokenError."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
