import os
import sys

# Add the 'backend' directory to sys.path so 'from app...' imports work correctly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import realtime, tools
from app.config import settings
from app.database.session import engine, Base

# Create DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="VOCALIS.AI Voice Agent Backend",
    description="Real-time WebRTC Voice Agent using OpenAI Realtime API",
    version="2.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
from app.api import ws
app.include_router(ws.router, prefix="/api")
app.include_router(tools.router, prefix="/api")

# Serve frontend statically
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=(settings.ENV == "development"))
