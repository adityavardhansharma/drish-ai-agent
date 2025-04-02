import logging
import os
from typing import List, Tuple, Optional

# Google Sheets API imports
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Import settings
try:
    from utils.config import settings
except ImportError:
    # Fallback if config can't be imported
    from os import environ
    
    class FallbackSettings:
        leave_sheet_id = environ.get("LEAVE_SHEET_ID", "your-google-sheet-id")
    
    settings = FallbackSettings()

logger = logging.getLogger(__name__)

# Use sheet ID from settings
SPREADSHEET_ID = settings.leave_sheet_id  # Get from settings
CREDENTIALS_PATH = "secrets/leave-checker-credentials.json"  # Path to service account credentials

# Constants for sheet operations
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
DEFAULT_RANGE = "A1:Z100"  # Default range to fetch

def get_sheets_service() -> Optional[object]:
    """Create and return a Google Sheets API service object."""
    try:
        if not os.path.exists(CREDENTIALS_PATH):
            logger.error(f"Credentials file not found at: {CREDENTIALS_PATH}")
            return None
            
        credentials = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=SCOPES)
        service = build("sheets", "v4", credentials=credentials)
        logger.info("Google Sheets API service created successfully")
        return service
    except Exception as e:
        logger.error(f"Failed to create Google Sheets service: {e}")
        return None

def get_sheet_names() -> List[str]:
    """Get all sheet names from the spreadsheet."""
    try:
        service = get_sheets_service()
        if not service:
            return []
            
        sheet_metadata = service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
        sheets = sheet_metadata.get('sheets', [])
        sheet_names = [sheet['properties']['title'] for sheet in sheets]
        logger.info(f"Found {len(sheet_names)} sheets in spreadsheet")
        return sheet_names
    except Exception as e:
        logger.error(f"Error fetching sheet names: {e}")
        return []

def get_sheet_data(sheet_name: str) -> List[List[str]]:
    """Fetch data from a specific sheet in the spreadsheet."""
    try:
        service = get_sheets_service()
        if not service:
            return []
            
        range_name = f"'{sheet_name}'!{DEFAULT_RANGE}"
        result = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=range_name
        ).execute()
        
        values = result.get('values', [])
        if not values:
            logger.warning(f"No data found in sheet: {sheet_name}")
            return []
            
        logger.info(f"Successfully fetched {len(values)} rows from sheet: {sheet_name}")
        return values
    except HttpError as err:
        logger.error(f"Google Sheets API error: {err}")
        return []
    except Exception as e:
        logger.error(f"Error fetching sheet data: {e}")
        return []

def find_employee_data(sheet_data: List[List[str]], employee_name: str) -> Tuple[Optional[List[str]], Optional[List[str]]]:
    """Find employee data by name in a sheet."""
    if not sheet_data or len(sheet_data) < 2:  # Need at least header and one data row
        logger.warning("Insufficient data in sheet to find employee")
        return None, None
        
    header_row = sheet_data[0]
    
    # Find row with employee name
    for row in sheet_data[1:]:  # Skip header row
        for cell in row:
            if isinstance(cell, str) and employee_name.lower() in cell.lower():
                logger.info(f"Found employee '{employee_name}' in sheet data")
                return header_row, row
                
    logger.warning(f"Employee '{employee_name}' not found in sheet data")
    return None, None

def get_employee_leave_data(employee_name: str, month: str) -> dict:
    """
    Get leave data for an employee for a specific month.
    
    Args:
        employee_name: The full name of the employee (with title)
        month: The month to check (should match a sheet name)
        
    Returns:
        Dict with success flag and data/error message
    """
    try:
        # Validate inputs
        if not employee_name or not month:
            return {"success": False, "error": "Employee name and month are required"}
            
        # Get all sheet names to check if the month exists
        all_sheets = get_sheet_names()
        if not all_sheets:
            return {"success": False, "error": "Could not access the leave spreadsheet"}
            
        if month not in all_sheets:
            return {"success": False, "error": f"Data for month '{month}' not found"}
            
        # Get data for the specific month
        sheet_data = get_sheet_data(month)
        if not sheet_data:
            return {"success": False, "error": f"No data found for month: {month}"}
            
        # Find employee in the data
        header_row, employee_row = find_employee_data(sheet_data, employee_name)
        if not header_row or not employee_row:
            return {"success": False, "error": f"Employee '{employee_name}' not found in {month} data"}
            
        return {
            "success": True,
            "data": {
                "employee_name": employee_name,
                "month": month,
                "header_row": header_row,
                "employee_row": employee_row
            }
        }
    except Exception as e:
        logger.error(f"Error retrieving employee leave data: {e}")
        return {"success": False, "error": str(e)} 