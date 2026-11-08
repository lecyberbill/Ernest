import json
import math
from typing import List, Dict, Any, Optional

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Calcule la similarité cosinus entre deux vecteurs."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot / (norm1 * norm2)

class VectorMemoryIndex:
    """
    Index sémantique vectoriel local stocké dans SQLite.
    Gère le calcul d'embeddings (via LM Studio ou fallback) et la recherche par similarité.
    """
    def __init__(self, conn):
        self.conn = conn
        self._ensure_table()

    def _ensure_table(self):
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS memory_embeddings (
                    memory_id INTEGER PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    key TEXT NOT NULL,
                    embedding_json TEXT NOT NULL,
                    model TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(memory_id) REFERENCES memories(id) ON DELETE CASCADE
                )
            """)
            self.conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_mem_emb_proj 
                ON memory_embeddings(project_id)
            """)

    def get_embedding(self, text: str, base_url: str = "http://127.0.0.1:1234") -> Optional[List[float]]:
        """Calcule l'embedding d'un texte via l'API OpenAI / LM Studio locale."""
        import http.client
        try:
            clean_url = base_url.replace("http://", "").replace("https://", "").split("/")[0]
            if ":" in clean_url:
                host, port_str = clean_url.split(":", 1)
                port = int(port_str)
            else:
                host = clean_url
                port = 80
            
            payload = json.dumps({
                "model": "text-embedding-nomic-embed-text-v1.5@q4_k_m",
                "input": text
            })
            
            conn = http.client.HTTPConnection(host, port, timeout=5)
            conn.request("POST", "/v1/embeddings", body=payload, headers={"Content-Type": "application/json"})
            res = conn.getresponse()
            if res.status == 200:
                data = json.loads(res.read().decode("utf-8"))
                return data["data"][0]["embedding"]
        except Exception:
            pass
        return None

    def index_memory(self, memory_id: int, project_id: str, key: str, text: str, base_url: str = "http://127.0.0.1:1234"):
        """Calcule et persiste l'embedding d'une mémoire."""
        emb = self.get_embedding(f"{key}: {text}", base_url=base_url)
        if not emb:
            return
        emb_json = json.dumps(emb)
        with self.conn:
            self.conn.execute("""
                INSERT INTO memory_embeddings (memory_id, project_id, key, embedding_json, model, updated_at)
                VALUES (?, ?, ?, ?, 'nomic-embed-text-v1.5', CURRENT_TIMESTAMP)
                ON CONFLICT(memory_id) DO UPDATE SET
                    embedding_json = excluded.embedding_json,
                    key = excluded.key,
                    updated_at = CURRENT_TIMESTAMP
            """, (memory_id, project_id, key, emb_json))

    def search_similar(self, project_id: str, query: str, limit: int = 5, base_url: str = "http://127.0.0.1:1234") -> List[Dict[str, Any]]:
        """Recherche les mémoires les plus proches sémantiquement de la requête."""
        query_emb = self.get_embedding(query, base_url=base_url)
        if not query_emb:
            return []

        cursor = self.conn.cursor()
        rows = cursor.execute("""
            SELECT me.memory_id, me.key, me.embedding_json, m.content, m.scope
            FROM memory_embeddings me
            JOIN memories m ON m.id = me.memory_id
            WHERE me.project_id = ?
        """, (project_id,)).fetchall()

        scored = []
        for r in rows:
            try:
                emb = json.loads(r["embedding_json"])
                sim = cosine_similarity(query_emb, emb)
                scored.append({
                    "id": r["memory_id"],
                    "key": r["key"],
                    "content": r["content"],
                    "scope": r["scope"],
                    "score": round(sim, 4)
                })
            except Exception:
                continue

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:limit]
