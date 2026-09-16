from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any

from app.tools.registry import registry
# Import to ensure tools are registered
import app.rag.engine 

router = APIRouter()

class ToolExecutionRequest(BaseModel):
    name: str
    arguments: Dict[str, Any]

@router.post("/tools/execute")
async def execute_tool(request: ToolExecutionRequest):
    """
    Executes a tool/function call requested by the OpenAI Realtime API.
    The browser proxies the function call here, we run the Python logic, and return the result.
    """
    try:
        result = await registry.execute(request.name, request.arguments)
        return {"success": True, "result": result}
    except Exception as e:
        # In a real app we'd log this securely
        raise HTTPException(status_code=400, detail=str(e))
