import logging
from fastapi import FastAPI
import inngest
import inngest.fast_api
from dotenv import load_dotenv
import uuid
import os
import datetime
from data_loader import load_and_chunk_pdf, embed_texts

load_dotenv()

inngest_client = inngest.Inngest(
    app_id="rag_app",
    logger=logging.getLogger("uvicorn"),
    is_production=False,
    serializer=inngest.PydanticSerializer(),

)

@inngest_client.create_function(
    fn_id="RAG: INgest PDF",
    trigger=inngest.TriggerEvent(event="rag/inngest_pdf")
)

async def rag_ingest_pdf(ctx: inngest.Context):
    return {"status": "success"}

app = FastAPI()

# app.get()

inngest.fast_api.serve(app, inngest_client, functions=[rag_ingest_pdf])