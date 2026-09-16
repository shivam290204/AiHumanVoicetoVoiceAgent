from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # App
    ENV: str = "development"
    PORT: int = 8787
    
    # Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "models/gemini-2.5-flash-native-audio-latest"
    
    # Database
    DATABASE_URL: str = "sqlite:///./voice_agent.db"
    
    # RAG
    CHROMA_PERSIST_DIR: str = "./chroma_db_gemini"
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
