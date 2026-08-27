import logging
import json
import random
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
import inngest
import inngest.fast_api
from inngest.experimental import ai
from dotenv import load_dotenv
import uuid
import os
import datetime

from data_loader import load_and_chunk_pdf, embed_texts
from vector_db import QdrantStorage
from custom_types import RAQQueryResult, RAGSearchResult, RAGUpsertResult, RAGChunkAndSrc

from database import get_db, User, KnowledgeBase, Quiz, FlashcardSet
from auth import get_password_hash, verify_password, create_access_token, get_current_user

load_dotenv()

inngest_client = inngest.Inngest(
    app_id="rag_app",
    logger=logging.getLogger("uvicorn"),
    is_production=False,
    serializer=inngest.PydanticSerializer()
)

@inngest_client.create_function(
    fn_id="RAG: Ingest PDF",
    trigger=inngest.TriggerEvent(event="rag/ingest_pdf"),
    throttle=inngest.Throttle(
        limit=2, period=datetime.timedelta(minutes=1)
    ),
    rate_limit=inngest.RateLimit(
        limit=1,
        period=datetime.timedelta(hours=4),
        key="event.data.source_id",
  ),
)
async def rag_ingest_pdf(ctx: inngest.Context):
    def _load(ctx: inngest.Context) -> RAGChunkAndSrc:
        pdf_path = ctx.event.data["pdf_path"]
        source_id = ctx.event.data.get("source_id", pdf_path)
        chunks = load_and_chunk_pdf(pdf_path)
        return RAGChunkAndSrc(chunks=chunks, source_id=source_id)

    def _upsert(chunks_and_src: RAGChunkAndSrc, ctx: inngest.Context) -> RAGUpsertResult:
        chunks = chunks_and_src.chunks
        source_id = chunks_and_src.source_id
        kb_id = ctx.event.data.get("kb_id")
        vecs = embed_texts(chunks)
        ids = [str(uuid.uuid5(uuid.NAMESPACE_URL, f"{source_id}:{i}")) for i in range(len(chunks))]
        payloads = [{"source": source_id, "text": chunks[i]} for i in range(len(chunks))]
        QdrantStorage(collection=f"kb_{kb_id}").upsert(ids, vecs, payloads)
        return RAGUpsertResult(ingested=len(chunks))

    chunks_and_src = await ctx.step.run("load-and-chunk", lambda: _load(ctx), output_type=RAGChunkAndSrc)
    ingested = await ctx.step.run("embed-and-upsert", lambda: _upsert(chunks_and_src, ctx), output_type=RAGUpsertResult)
    return ingested.model_dump()


@inngest_client.create_function(
    fn_id="RAG: Query PDF",
    trigger=inngest.TriggerEvent(event="rag/query_pdf_ai")
)
async def rag_query_pdf_ai(ctx: inngest.Context):
    def _search(question: str, top_k: int, kb_id: int) -> RAGSearchResult:
        query_vec = embed_texts([question])[0]
        store = QdrantStorage(collection=f"kb_{kb_id}")
        found = store.search(query_vec, top_k)
        return RAGSearchResult(contexts=found["contexts"], sources=found["sources"])

    question = ctx.event.data["question"]
    top_k = int(ctx.event.data.get("top_k", 5))
    kb_id = ctx.event.data.get("kb_id")

    found = await ctx.step.run("embed-and-search", lambda: _search(question, top_k, kb_id), output_type=RAGSearchResult)

    context_block = "\n\n".join(f"- {c}" for c in found.contexts)
    user_content = (
        "Use the following context to answer the question.\n\n"
        f"Context:\n{context_block}\n\n"
        f"Question: {question}\n"
        "Answer concisely using the context above. Format your output in a structured way using Markdown (e.g., headers, bullet points) so it is easy to read."
    )

    import inngest.experimental.ai.gemini
    adapter = inngest.experimental.ai.gemini.Adapter(
        auth_key=os.getenv("GEMINI_API_KEY"),
        model="gemini-2.5-flash"
    )

    res = await ctx.step.ai.infer(
        "llm-answer",
        adapter=adapter,
        body={
            "contents": [
                {
                    "parts": [{"text": "You answer questions using only the provided context.\n\n" + user_content}]
                }
            ],
            "generationConfig": {
                "maxOutputTokens": 1024,
                "temperature": 0.2
            }
        }
    )

    answer = res["candidates"][0]["content"]["parts"][0]["text"].strip()
    return {"answer": answer, "sources": found.sources, "num_contexts": len(found.contexts)}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

inngest.fast_api.serve(app, inngest_client, [rag_ingest_pdf, rag_query_pdf_ai])

class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class KBCreate(BaseModel):
    name: str
    description: str = None

class QueryRequest(BaseModel):
    question: str
    kb_id: int
    top_k: int = 5

class GenerateQuizRequest(BaseModel):
    num_questions: int = 5
    title: str = None

class GenerateFlashcardsRequest(BaseModel):
    num_cards: int = 10
    title: str = None

# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_kb_context(kb_id: int, max_chunks: int = 20) -> str:
    """Retrieve a broad sample of text chunks from the KB's vector store."""
    store = QdrantStorage(collection=f"kb_{kb_id}")
    try:
        # Scroll random points to get diverse context
        results, _ = store.client.scroll(
            collection_name=f"kb_{kb_id}",
            limit=max_chunks,
            with_payload=True,
        )
        chunks = [r.payload.get("text", "") for r in results if r.payload and r.payload.get("text")]
        if not chunks:
            return ""
        random.shuffle(chunks)
        return "\n\n".join(chunks[:max_chunks])
    except Exception:
        return ""


def _parse_json_response(text: str) -> list:
    """Extract and parse a JSON array from an LLM response, stripping markdown fences."""
    text = text.strip()
    # Strip ```json ... ``` fences
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last fence lines
        inner = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
        text = inner.strip()
    return json.loads(text)


def _gemini_generate(prompt: str) -> str:
    """Call Gemini synchronously and return the raw text response."""
    from data_loader import client
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    return response.text


# ── Auth Routes ───────────────────────────────────────────────────────────────

@app.post("/api/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(user.password)
    new_user = User(username=user.username, password_hash=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User registered successfully"}

@app.post("/api/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

# ── Knowledge Base Routes ─────────────────────────────────────────────────────

@app.get("/api/kb")
def get_kbs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    kbs = db.query(KnowledgeBase).filter(KnowledgeBase.user_id == current_user.id).all()
    return kbs

@app.post("/api/kb")
def create_kb(kb: KBCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_kb = KnowledgeBase(name=kb.name, description=kb.description, user_id=current_user.id)
    db.add(new_kb)
    db.commit()
    db.refresh(new_kb)
    return new_kb

@app.post("/api/upload")
async def api_upload(
    file: UploadFile = File(...), 
    kb_id: int = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found or unauthorized")

    # Store under /app/uploads/<user_id>/<kb_id>/<filename>
    upload_dir = os.path.join("uploads", str(current_user.id), str(kb_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)

    with open(file_path, "wb") as f:
        f.write(await file.read())
    
    await inngest_client.send(
        inngest.Event(
            name="rag/ingest_pdf",
            data={
                "pdf_path": file_path,
                "source_id": file.filename,
                "kb_id": kb_id
            }
        )
    )
    return {"message": "Upload successful! Ingestion started.", "filename": file.filename}

@app.get("/api/kb/{kb_id}/files")
def list_kb_files(
    kb_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found or unauthorized")

    upload_dir = os.path.join("uploads", str(current_user.id), str(kb_id))
    if not os.path.isdir(upload_dir):
        return []

    files = []
    for fname in os.listdir(upload_dir):
        fpath = os.path.join(upload_dir, fname)
        if os.path.isfile(fpath):
            stat = os.stat(fpath)
            files.append({
                "name": fname,
                "size": stat.st_size,
                "uploaded_at": stat.st_mtime
            })
    # Sort by most recently uploaded
    files.sort(key=lambda x: x["uploaded_at"], reverse=True)
    return files

@app.post("/api/query")
async def api_query(
    req: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == req.kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found or unauthorized")
        
    query_vec = embed_texts([req.question])[0]
    store = QdrantStorage(collection=f"kb_{req.kb_id}")
    found = store.search(query_vec, req.top_k)
    
    context_block = "\n\n".join(f"- {c}" for c in found["contexts"])
    user_content = (
        "Use the following context to answer the question.\n\n"
        f"Context:\n{context_block}\n\n"
        f"Question: {req.question}\n"
        "Answer concisely using the context above. Format your output in a structured way using Markdown (e.g., headers, bullet points) so it is easy to read."
    )
    
    from data_loader import client
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="You answer questions using only the provided context.\n\n" + user_content,
    )
    
    return {
        "answer": response.text, 
        "sources": found["sources"], 
        "num_contexts": len(found["contexts"])
    }

# ── Quiz Routes ───────────────────────────────────────────────────────────────

@app.post("/api/kb/{kb_id}/quiz/generate")
def generate_quiz(
    kb_id: int,
    req: GenerateQuizRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate an AI multiple-choice quiz from KB content and save it."""
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found or unauthorized")

    context = _get_kb_context(kb_id, max_chunks=20)
    if not context:
        raise HTTPException(status_code=400, detail="No documents found in this knowledge base. Upload PDFs first.")

    num_q = max(3, min(req.num_questions, 20))

    prompt = f"""You are an expert quiz creator. Based on the following knowledge base content, generate exactly {num_q} multiple-choice questions.

KNOWLEDGE BASE CONTENT:
{context}

INSTRUCTIONS:
- Each question must have exactly 4 options labeled A, B, C, D
- Only one option is correct
- The "answer" field must be the full text of the correct option (not just the letter)
- Include a brief "explanation" for why the answer is correct
- Cover diverse topics from the content
- Make questions educational and clear

Return ONLY a valid JSON array with no extra text, no markdown, no explanation. Format:
[
  {{
    "question": "Question text here?",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "answer": "The exact text of the correct option",
    "explanation": "Brief explanation of why this is correct"
  }}
]"""

    try:
        raw = _gemini_generate(prompt)
        questions = _parse_json_response(raw)
        if not isinstance(questions, list) or len(questions) == 0:
            raise ValueError("Invalid questions format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate quiz: {str(e)}")

    title = req.title or f"Quiz #{db.query(Quiz).filter(Quiz.kb_id == kb_id).count() + 1} — {kb.name}"
    quiz = Quiz(
        kb_id=kb_id,
        title=title,
        questions=json.dumps(questions),
        created_at=datetime.datetime.utcnow()
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    return {
        "id": quiz.id,
        "kb_id": quiz.kb_id,
        "title": quiz.title,
        "questions": questions,
        "created_at": quiz.created_at.isoformat()
    }

@app.get("/api/kb/{kb_id}/quizzes")
def list_quizzes(
    kb_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all quizzes for a knowledge base."""
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found or unauthorized")

    quizzes = db.query(Quiz).filter(Quiz.kb_id == kb_id).order_by(Quiz.created_at.desc()).all()
    return [
        {
            "id": q.id,
            "kb_id": q.kb_id,
            "title": q.title,
            "num_questions": len(json.loads(q.questions)),
            "created_at": q.created_at.isoformat() if q.created_at else None
        }
        for q in quizzes
    ]

@app.get("/api/quiz/{quiz_id}")
def get_quiz(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single quiz with all questions."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == quiz.kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return {
        "id": quiz.id,
        "kb_id": quiz.kb_id,
        "title": quiz.title,
        "questions": json.loads(quiz.questions),
        "created_at": quiz.created_at.isoformat() if quiz.created_at else None
    }

@app.delete("/api/quiz/{quiz_id}")
def delete_quiz(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a quiz."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == quiz.kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=403, detail="Unauthorized")
    db.delete(quiz)
    db.commit()
    return {"message": "Quiz deleted"}

# ── Flashcard Routes ──────────────────────────────────────────────────────────

@app.post("/api/kb/{kb_id}/flashcards/generate")
def generate_flashcards(
    kb_id: int,
    req: GenerateFlashcardsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate AI flashcards from KB content and save them."""
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found or unauthorized")

    context = _get_kb_context(kb_id, max_chunks=20)
    if not context:
        raise HTTPException(status_code=400, detail="No documents found in this knowledge base. Upload PDFs first.")

    num_c = max(5, min(req.num_cards, 30))

    prompt = f"""You are an expert educator creating study flashcards. Based on the following knowledge base content, generate exactly {num_c} flashcards.

KNOWLEDGE BASE CONTENT:
{context}

INSTRUCTIONS:
- Each flashcard has a "front" (a concise question or term) and a "back" (the answer or definition)
- Keep fronts short and clear — ideally under 15 words
- Backs should be concise but complete — 1-3 sentences maximum
- Cover diverse and important concepts from the content
- Avoid trivial or duplicate questions

Return ONLY a valid JSON array with no extra text, no markdown, no explanation. Format:
[
  {{
    "front": "Short question or term",
    "back": "Complete answer or definition"
  }}
]"""

    try:
        raw = _gemini_generate(prompt)
        cards = _parse_json_response(raw)
        if not isinstance(cards, list) or len(cards) == 0:
            raise ValueError("Invalid cards format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate flashcards: {str(e)}")

    title = req.title or f"Flashcards #{db.query(FlashcardSet).filter(FlashcardSet.kb_id == kb_id).count() + 1} — {kb.name}"
    fc_set = FlashcardSet(
        kb_id=kb_id,
        title=title,
        cards=json.dumps(cards),
        created_at=datetime.datetime.utcnow()
    )
    db.add(fc_set)
    db.commit()
    db.refresh(fc_set)

    return {
        "id": fc_set.id,
        "kb_id": fc_set.kb_id,
        "title": fc_set.title,
        "cards": cards,
        "created_at": fc_set.created_at.isoformat()
    }

@app.get("/api/kb/{kb_id}/flashcards")
def list_flashcards(
    kb_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all flashcard sets for a knowledge base."""
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found or unauthorized")

    sets = db.query(FlashcardSet).filter(FlashcardSet.kb_id == kb_id).order_by(FlashcardSet.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "kb_id": s.kb_id,
            "title": s.title,
            "num_cards": len(json.loads(s.cards)),
            "created_at": s.created_at.isoformat() if s.created_at else None
        }
        for s in sets
    ]

@app.get("/api/flashcards/{fc_id}")
def get_flashcards(
    fc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single flashcard set with all cards."""
    fc = db.query(FlashcardSet).filter(FlashcardSet.id == fc_id).first()
    if not fc:
        raise HTTPException(status_code=404, detail="Flashcard set not found")
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == fc.kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return {
        "id": fc.id,
        "kb_id": fc.kb_id,
        "title": fc.title,
        "cards": json.loads(fc.cards),
        "created_at": fc.created_at.isoformat() if fc.created_at else None
    }

@app.delete("/api/flashcards/{fc_id}")
def delete_flashcards(
    fc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a flashcard set."""
    fc = db.query(FlashcardSet).filter(FlashcardSet.id == fc_id).first()
    if not fc:
        raise HTTPException(status_code=404, detail="Flashcard set not found")
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == fc.kb_id, KnowledgeBase.user_id == current_user.id).first()
    if not kb:
        raise HTTPException(status_code=403, detail="Unauthorized")
    db.delete(fc)
    db.commit()
    return {"message": "Flashcard set deleted"}

# Serve the static frontend
import os
if os.path.isdir("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")
