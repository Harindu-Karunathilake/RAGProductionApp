from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Text, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)

    knowledge_bases = relationship("KnowledgeBase", back_populates="owner")

class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    
    owner = relationship("User", back_populates="knowledge_bases")
    quizzes = relationship("Quiz", back_populates="kb", cascade="all, delete-orphan")
    flashcard_sets = relationship("FlashcardSet", back_populates="kb", cascade="all, delete-orphan")

class Quiz(Base):
    """Stores an AI-generated multiple-choice quiz linked to a knowledge base.
    
    `questions` is a JSON string: list of
    {"question": str, "options": [A, B, C, D], "answer": str, "explanation": str}
    """
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True, index=True)
    kb_id = Column(Integer, ForeignKey("knowledge_bases.id"), nullable=False)
    title = Column(String, nullable=False)
    questions = Column(Text, nullable=False)  # JSON array
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    kb = relationship("KnowledgeBase", back_populates="quizzes")

class FlashcardSet(Base):
    """Stores an AI-generated flashcard set linked to a knowledge base.
    
    `cards` is a JSON string: list of {"front": str, "back": str}
    """
    __tablename__ = "flashcard_sets"

    id = Column(Integer, primary_key=True, index=True)
    kb_id = Column(Integer, ForeignKey("knowledge_bases.id"), nullable=False)
    title = Column(String, nullable=False)
    cards = Column(Text, nullable=False)  # JSON array
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    kb = relationship("KnowledgeBase", back_populates="flashcard_sets")

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
