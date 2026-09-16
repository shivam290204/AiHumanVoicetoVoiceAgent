import chromadb
from app.config import settings
from app.tools.registry import registry

from chromadb.api.types import EmbeddingFunction, Documents, Embeddings
import httpx

class GeminiEmbeddingFunction(EmbeddingFunction):
    def __init__(self, api_key: str):
        self.api_key = api_key
        
    def __call__(self, input: Documents) -> Embeddings:
        # Check for empty input
        if not input:
            return []
            
        requests = []
        for doc in input:
            requests.append({
                "model": "models/text-embedding-004",
                "content": {"parts": [{"text": doc}]}
            })
            
        response = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key={self.api_key}",
            json={"requests": requests}
        )
        response.raise_for_status()
        data = response.json()
        return [item["values"] for item in data["embeddings"]]

# Initialize ChromaDB for local vector storage
chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
collection = chroma_client.get_or_create_collection(
    name="company_knowledge",
    embedding_function=GeminiEmbeddingFunction(settings.GEMINI_API_KEY)
)

# Seed with some initial data if empty (for demonstration)
try:
    if collection.count() == 0:
        collection.add(
            documents=[
                "Our company VOCALIS.AI offers enterprise voice agent solutions starting at $500/month.",
                "Support hours are Monday to Friday, 9 AM to 5 PM EST.",
                "We integrate with Salesforce, HubSpot, and custom REST APIs."
            ],
            metadatas=[{"source": "pricing"}, {"source": "support"}, {"source": "integrations"}],
            ids=["id1", "id2", "id3"]
        )
except Exception as e:
    print(f"Warning: RAG seeding failed (this won't stop the server): {e}")

@registry.register(
    name="retrieve_company_knowledge",
    description="Retrieves official company documentation, pricing, or FAQ information to answer a user's question.",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The specific question or topic to search for in the company knowledge base."
            }
        },
        "required": ["query"]
    }
)
async def retrieve_company_knowledge(query: str) -> str:
    """
    RAG Retriever tool called by the AI during a conversation.
    Searches the vector database for relevant context.
    """
    results = collection.query(
        query_texts=[query],
        n_results=2
    )
    
    if not results['documents'] or not results['documents'][0]:
        return "No relevant information found in the company knowledge base."
        
    # Combine the top documents into a context string
    context = "\n".join(results['documents'][0])
    return f"Retrieved Knowledge:\n{context}"
