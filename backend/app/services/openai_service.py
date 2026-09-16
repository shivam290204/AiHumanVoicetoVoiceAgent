import httpx
from app.config import settings
from app.tools.registry import registry
from app.conversation.persona import get_system_prompt

async def create_ephemeral_token() -> dict:
    """
    Calls the OpenAI Realtime API to generate an ephemeral session token.
    This token allows the browser to connect directly via WebRTC securely.
    """
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is not set.")

    url = "https://api.openai.com/v1/realtime/sessions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    
    # Configure the session properties here (Voice, System Prompt, VAD, Tools)
    payload = {
        "model": settings.OPENAI_REALTIME_MODEL,
        "modalities": ["audio", "text"],
        "instructions": get_system_prompt(),
        "voice": settings.OPENAI_VOICE,
        # Turn detection uses Server VAD by default, enabling natural interruptions
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 500
        },
        "tools": registry.get_schemas()
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload, timeout=10.0)
        
        if response.status_code != 200:
            raise Exception(f"Failed to generate ephemeral token: {response.text}")
            
        return response.json()
