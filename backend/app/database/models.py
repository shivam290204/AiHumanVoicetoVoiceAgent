from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
import datetime
from app.database.session import Base

class Session(Base):
    __tablename__ = "sessions"
    
    id = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    voice = Column(String)
    
    # Ready for Postgres/Production relations
    # tool_calls = relationship("ToolCall", back_populates="session")

class ToolCall(Base):
    __tablename__ = "tool_calls"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id"))
    tool_name = Column(String, index=True)
    arguments = Column(Text)
    result = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
