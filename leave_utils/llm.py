import logging
from typing import List

from llm.openrouter_client import chat_completion_sync
from utils.config import settings

logger = logging.getLogger(__name__)

def format_leave_details(employee_name: str, header_row: List[str], employee_row: List[str]) -> str:
    """
    Format leave details using the configured OpenRouter model.
    
    Args:
        employee_name: The name of the employee
        header_row: List of header values from the spreadsheet
        employee_row: List of data values for the employee
    
    Returns:
        Formatted leave details as a string
    """
    try:
        # Convert lists to strings for prompt
        header_str = ", ".join(map(str, header_row))
        data_str = ", ".join(map(str, employee_row))
        
        # Prompt template
        prompt = f"""
        Analyze the following spreadsheet data for employee '{employee_name}'.
        The first line contains comma-separated column headers.
        The second line contains the corresponding comma-separated data values for the employee. Blank values might appear as empty strings between commas.

        Headers: {header_str}
        Data Row: {data_str}

        Expected Structure & Terminology:
        *   The sheet likely contains sections for "Opening Balance" and "Closing Balance".
        *   Within *both* the Opening and Closing sections, expect columns for specific leave types, potentially in this order:
            *   "S/C" (Sick/Casual Leave)
            *   "PL" (Privilege Leave)
            *   "Comp" (Complimentary Leave)
            *   "Total" (Total leaves for that section)
        *   Headers might combine section and type (e.g., "Opening Balance - S/C", "Closing Balance - Total", "OB PL", "CB Comp").

        Your Task:
        1.  **Identify Columns:** Based on the Headers line and the Expected Structure, identify the specific columns corresponding to:
            *   Opening Balance S/C
            *   Opening Balance PL
            *   Opening Balance Comp
            *   Opening Balance Total
            *   Closing Balance S/C
            *   Closing Balance PL
            *   Closing Balance Comp
            *   Closing Balance Total
        2.  **Extract Values:** Extract the corresponding numeric values for '{employee_name}' from the Data Row for each identified column. Treat blank values or non-numeric text as "Not Found" or 0 if needed for calculation.
        3.  **Calculate Net Change:** Calculate the difference: `Net Change = (Closing Balance Total value) - (Opening Balance Total value)`. This shows if leaves increased or decreased overall. Ensure both totals are numeric before calculating; if not, state "Calculation N/A".
        4.  **Format Output:** Present the information concisely and directly as shown below. Do *not* include explanations of the terminology (S/C, PL etc.) in the final output. Use "N/A" if a specific value could not be found or extracted reliably.

        Required Output Format:

        Leave Summary for {employee_name}:

        **Opening Balance:**
        *   ***S/C:*** [Value or "N/A"]
        *   ***PL:*** [Value or "N/A"]
        *   ***Comp:*** [Value or "N/A"]
        *   ***Total:*** [Value or "N/A"]

        **Closing Balance:**
        *   ***S/C:*** [Value or "N/A"]
        *   ***PL:*** [Value or "N/A"]
        *   ***Comp:*** [Value or "N/A"]
        *   ***Total:*** [Value or "N/A"]

        **Net Change in Total Leaves:** Tell if there is a increase or decrease in total leaves and by how much.
        
        Generate *only* the output in this specific format.
        """
        
        formatted_text = chat_completion_sync(
            [
                {
                    "role": "system",
                    "content": "Format spreadsheet leave-balance rows into concise leave summaries.",
                },
                {"role": "user", "content": prompt},
            ],
            model=getattr(settings, "openrouter_leave_model", None),
            max_tokens=1200,
            temperature=0.2,
        )
        logger.info(f"Successfully formatted leave details for {employee_name}")
        return formatted_text
    
    except Exception as e:
        logger.error(f"Error formatting leave details with OpenRouter: {e}")
        return _basic_format_leave_details(employee_name, header_row, employee_row)

def _basic_format_leave_details(employee_name: str, header_row: List[str], employee_row: List[str]) -> str:
    """Basic formatting fallback when AI formatting is not available."""
    try:
        # Create a simple table format
        result = f"Leave Summary for {employee_name}:\n\n"
        
        # Ensure lengths match and pad if necessary
        if len(employee_row) < len(header_row):
            employee_row.extend([''] * (len(header_row) - len(employee_row)))
            
        # Build table
        for i, header in enumerate(header_row):
            if i < len(employee_row):
                value = employee_row[i] if employee_row[i] else "N/A"
                result += f"{header}: {value}\n"
                
        return result
    except Exception as e:
        logger.error(f"Error in basic leave details formatting: {e}")
        return f"Error formatting leave data: {str(e)}"
