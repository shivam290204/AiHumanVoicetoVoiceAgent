from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

from app.services.openai_service import create_ephemeral_token

router = APIRouter()

class SessionResponse(BaseModel):
    client_secret: Dict[str, Any]

@router.post("/realtime/session", response_model=SessionResponse)
async def create_realtime_session():
    """
    Creates an ephemeral session token for the OpenAI Realtime API.
    The frontend uses this token to establish a direct WebRTC connection.
    """
    try:
        session_data = await create_ephemeral_token()
        return SessionResponse(client_secret=session_data.get("client_secret", {}))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
