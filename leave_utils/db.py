import logging
from typing import Optional

from passlib.hash import bcrypt
from pydantic import BaseModel

try:
    from utils.config import settings
except ImportError:
    from os import environ

    class FallbackSettings:
        convex_url = environ.get("CONVEX_URL")
        convex_app_secret = environ.get("CONVEX_APP_SECRET")
        convex_admin_key = environ.get("CONVEX_ADMIN_KEY")

    settings = FallbackSettings()

from services.convex_store import convex_args, convex_client

logger = logging.getLogger(__name__)


class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    title: str


class User(BaseModel):
    id: str
    email: str
    full_name: str
    created_at: Optional[str] = None


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    return bcrypt.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.verify(plain_password, hashed_password)


def _public_user(user: dict) -> dict:
    return {key: value for key, value in user.items() if key != "password"}


def create_user(email: str, password: str, name: str, title: str) -> dict:
    client = convex_client()
    if not client:
        return {"success": False, "error": "Convex connection not available"}

    try:
        normalized_email = _normalize_email(email)
        existing = client.query(
            "users:getByEmail",
            convex_args(email=normalized_email),
        )
        if existing:
            return {"success": False, "error": "Email already registered"}

        user = client.mutation(
            "users:createUser",
            convex_args(
                email=normalized_email,
                password=hash_password(password),
                fullName=f"{title} {name}",
            ),
        )
        return {"success": True, "data": _public_user(user)}
    except Exception as error:
        logger.error("Error creating user in Convex: %s", error)
        return {"success": False, "error": str(error)}


def authenticate_user(email: str, password: str) -> dict:
    client = convex_client()
    if not client:
        return {"success": False, "error": "Convex connection not available"}

    try:
        user = client.query(
            "users:getByEmail",
            convex_args(email=_normalize_email(email)),
        )
        if not user or not verify_password(password, user["password"]):
            return {"success": False, "error": "Invalid email or password"}

        return {"success": True, "data": _public_user(user)}
    except Exception as error:
        logger.error("Error authenticating user with Convex: %s", error)
        return {"success": False, "error": str(error)}


def get_user_by_email(email: str) -> dict:
    client = convex_client()
    if not client:
        return {"success": False, "error": "Convex connection not available"}

    try:
        user = client.query(
            "users:getByEmail",
            convex_args(email=_normalize_email(email)),
        )
        if not user:
            return {"success": False, "error": "User not found"}
        return {"success": True, "data": _public_user(user)}
    except Exception as error:
        logger.error("Error retrieving user from Convex: %s", error)
        return {"success": False, "error": str(error)}
