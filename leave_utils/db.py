import os
import logging
from supabase import create_client
from passlib.hash import bcrypt
from pydantic import BaseModel
from typing import Optional

# Import settings
try:
    from utils.config import settings
except ImportError:
    # Fallback if config can't be imported
    from os import environ
    
    class FallbackSettings:
        supabase_url = environ.get("SUPABASE_URL", "https://your-supabase-url.supabase.co")
        supabase_key = environ.get("SUPABASE_KEY", "your-supabase-api-key")
    
    settings = FallbackSettings()

logger = logging.getLogger(__name__)

# Create Supabase client
try:
    supabase = create_client(settings.supabase_url, settings.supabase_key)
    logger.info("Supabase client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {e}")
    supabase = None

# User models
class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    title: str  # Mr., Mrs., Ms.

class User(BaseModel):
    id: str
    email: str
    full_name: str  # Includes title
    created_at: Optional[str] = None

# Password utilities
def hash_password(password: str) -> str:
    """Hash a password for storing."""
    return bcrypt.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a stored password against a provided password."""
    return bcrypt.verify(plain_password, hashed_password)

# User management functions
def create_user(email: str, password: str, name: str, title: str) -> dict:
    """Create a new user in the database."""
    if not supabase:
        return {"success": False, "error": "Database connection not available"}
    
    try:
        # Check if user already exists
        existing = supabase.table("login").select("email").eq("email", email).execute()
        if existing.data:
            return {"success": False, "error": "Email already registered"}
            
        # Format full name with title
        full_name = f"{title} {name}"
        
        # Hash password
        hashed_password = hash_password(password)
        
        # Insert new user
        result = supabase.table("login").insert({
            "email": email, 
            "password": hashed_password,
            "full_name": full_name
        }).execute()
        
        return {"success": True, "data": result.data[0]}
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        return {"success": False, "error": str(e)}

def authenticate_user(email: str, password: str) -> dict:
    """Verify user credentials and return user data if valid."""
    if not supabase:
        return {"success": False, "error": "Database connection not available"}
    
    try:
        # Get user by email
        result = supabase.table("login").select("*").eq("email", email).execute()
        
        if not result.data:
            return {"success": False, "error": "Invalid email or password"}
        
        user = result.data[0]
        
        # Verify password
        if not verify_password(password, user["password"]):
            return {"success": False, "error": "Invalid email or password"}
            
        # Return user without password
        user_data = {k: v for k, v in user.items() if k != "password"}
        return {"success": True, "data": user_data}
    except Exception as e:
        logger.error(f"Error authenticating user: {e}")
        return {"success": False, "error": str(e)}

def get_user_by_email(email: str) -> dict:
    """Retrieve user data by email."""
    if not supabase:
        return {"success": False, "error": "Database connection not available"}
    
    try:
        result = supabase.table("login").select("*").eq("email", email).execute()
        if not result.data:
            return {"success": False, "error": "User not found"}
            
        user = result.data[0]
        user_data = {k: v for k, v in user.items() if k != "password"}
        return {"success": True, "data": user_data}
    except Exception as e:
        logger.error(f"Error retrieving user: {e}")
        return {"success": False, "error": str(e)} 