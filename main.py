import logging
from fastapi import FastAPI
import inngest
import inngest.fast_api
from dotenv import load_dotenv
import uuid
import os
import datetime

laod_dotenv()

inngest_client = inngest.Client(
app_id="rag_app",
logging=logging.getLogger("uvicorn")
is_production=False,
serializer=inngest.PydanticSerializer()

)

app = FastAPI()

inngest.fastd