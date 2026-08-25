from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

class QdrantStorage:
    def __init__(self, url="http://localhost:6333", collection="docs" dim=3072):
        self.client = QdrantClient(url=url, timeout=30)
        self.collection = collection
      

        # Create collection if it doesn't exist
        if not self.client.collection_exists(self.collection):
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=self.dim, distance=Distance.COSINE)
            )

    def upsert(self, id, vector, payload):
        points = [PointStruct(id=ids[i], vector=vectors[i], payload=payload) for i in range(len(ids))]
        self.client.upsert(collection_name=self.collection, points=points)