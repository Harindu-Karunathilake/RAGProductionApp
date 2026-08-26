import logging
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

from database import get_db, User, KnowledgeBase
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

# Serve the static frontend
import os
if os.path.isdir("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")