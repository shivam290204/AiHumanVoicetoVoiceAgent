import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import websockets
from app.config import settings
from app.tools.registry import registry
import traceback

router = APIRouter()

GEMINI_WS_URL = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={settings.GEMINI_API_KEY}"

def log_debug(msg):
    with open("ws_debug.log", "a", encoding="utf-8") as f:
        f.write(msg + "\n")

@router.websocket("/ws/gemini")
async def gemini_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    log_debug("Browser websocket accepted")
    
    try:
        async with websockets.connect(GEMINI_WS_URL) as gemini_ws:
            log_debug("Connected to Gemini")
            
            setup_msg = {
                "setup": {
                    "model": settings.GEMINI_MODEL,
                    "generationConfig": {
                        "responseModalities": ["AUDIO"]
                    },
                    "tools": [{"function_declarations": registry.get_gemini_tools()}],
                    "system_instruction": {
                        "parts": [{"text": "You are VOCALIS, an AI voice agent. Be helpful, concise, and friendly. Answer in a human-like voice."}]
                    }
                }
            }
            await gemini_ws.send(json.dumps(setup_msg))
            
            setup_response = await gemini_ws.recv()
            log_debug(f"Setup Response: {setup_response}")
            
            async def forward_to_gemini():
                try:
                    while True:
                        data = await websocket.receive_text()
                        await gemini_ws.send(data)
                except WebSocketDisconnect:
                    log_debug("Browser disconnected cleanly")
                except Exception as e:
                    log_debug(f"Error forwarding to Gemini: {traceback.format_exc()}")

            async def forward_to_browser():
                try:
                    while True:
                        response_text = await gemini_ws.recv()
                        response = json.loads(response_text)
                        
                        if "serverContent" in response:
                            content = response["serverContent"]
                            await websocket.send_text(response_text)
                            
                            if "modelTurn" in content:
                                parts = content["modelTurn"].get("parts", [])
                                for part in parts:
                                    if "functionCall" in part:
                                        fn_call = part["functionCall"]
                                        name = fn_call["name"]
                                        args = fn_call.get("args", {})
                                        log_debug(f"Gemini requested tool: {name}")
                                        
                                        try:
                                            result = await registry.execute(name, args)
                                            tool_response = {
                                                "toolResponse": {
                                                    "functionResponses": [
                                                        {
                                                            "id": fn_call.get("id", name),
                                                            "name": name,
                                                            "response": {"result": result}
                                                        }
                                                    ]
                                                }
                                            }
                                            await gemini_ws.send(json.dumps(tool_response))
                                        except Exception as e:
                                            log_debug(f"Tool execution failed: {e}")
                        else:
                            log_debug(f"Gemini sent non-serverContent: {response_text}")
                except websockets.exceptions.ConnectionClosed as e:
                    log_debug(f"Gemini closed connection: {e.code} {e.reason}")
                except Exception as e:
                    log_debug(f"Error forwarding to browser: {traceback.format_exc()}")
            
            await asyncio.gather(forward_to_gemini(), forward_to_browser())
            log_debug("Gather finished")
            
    except Exception as e:
        log_debug(f"Failed to connect to Gemini: {traceback.format_exc()}")
    finally:
        try:
            await websocket.close()
            log_debug("Closed browser websocket")
        except:
            pass
