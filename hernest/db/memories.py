import sqlite3
from typing import Optional, Dict, Any, List

class MemoryService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def store_memory(
        self,
        project_id: str,
        key: str,
        content: str,
        scope: str,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Stocke une mémoire dans la base SQLite."""
        if scope not in ("session", "project"):
            raise ValueError(f"Scope invalide: '{scope}'. Doit être 'session' ou 'project'.")
        
        # En scope 'project', session_id doit être NULL selon le schéma
        effective_session_id = session_id if scope == "session" else None
        
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO memories (project_id, session_id, scope, key, content, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(project_id, session_id, key) DO UPDATE SET
                    content = excluded.content,
                    scope = excluded.scope,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (project_id, effective_session_id, scope, key, content)
            )
            # Synchronisation avec l'index FTS5
            try:
                self.conn.execute(
                    "INSERT INTO memories_fts (key, content, project_id) VALUES (?, ?, ?)",
                    (key, content, project_id)
                )
            except Exception:
                pass

            # Synchronisation avec l'index Vectoriel Local (RAG)
            try:
                row = self.conn.execute(
                    "SELECT id FROM memories WHERE project_id = ? AND key = ? AND (session_id = ? OR (session_id IS NULL AND ? IS NULL))",
                    (project_id, key, effective_session_id, effective_session_id)
                ).fetchone()
                if row:
                    from hernest.db.vector_memories import VectorMemoryIndex
                    vindex = VectorMemoryIndex(self.conn)
                    vindex.index_memory(row["id"] if isinstance(row, sqlite3.Row) else row[0], project_id, key, content)
            except Exception:
                pass
        return {
            "status": "success",
            "message": f"Memory '{key}' stored successfully in scope '{scope}'."
        }

    def recall_memory(
        self,
        project_id: str,
        key: str,
        session_id: Optional[str] = None
    ) -> Optional[str]:
        """
        Récupère une mémoire pour un project_id donné.
        Priorité : mémoire de session courante (si session_id renseigné) puis mémoire de projet.
        """
        cursor = self.conn.cursor()
        if session_id:
            row = cursor.execute(
                """
                SELECT content FROM memories 
                WHERE project_id = ? AND scope = 'session' AND session_id = ? AND key = ?
                """,
                (project_id, session_id, key)
            ).fetchone()
            if row:
                return row["content"] if isinstance(row, sqlite3.Row) else row[0]

        row = cursor.execute(
            """
            SELECT content FROM memories 
            WHERE project_id = ? AND scope = 'project' AND key = ?
            """,
            (project_id, key)
        ).fetchone()

        if row:
            return row["content"] if isinstance(row, sqlite3.Row) else row[0]
        return None

    def list_memories(self, project_id: str) -> List[Dict[str, Any]]:
        """Liste toutes les mémoires associées à un projet."""
        cursor = self.conn.cursor()
        rows = cursor.execute(
            """
            SELECT id, project_id, session_id, scope, key, content, created_at, updated_at
            FROM memories
            WHERE project_id = ?
            ORDER BY updated_at DESC
            """,
            (project_id,)
        ).fetchall()
        return [dict(r) for r in rows]

    def search_memories(self, project_id: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Recherche sémantique hybride : Vectorielle (RAG Cosine) avec repli FTS5 / LIKE.
        """
        # 1. Tentative recherche vectorielle locale
        try:
            from hernest.db.vector_memories import VectorMemoryIndex
            vindex = VectorMemoryIndex(self.conn)
            vector_results = vindex.search_similar(project_id, query, limit=limit)
            if vector_results and len(vector_results) > 0 and vector_results[0].get("score", 0) >= 0.40:
                return vector_results
        except Exception:
            pass

        # 2. Recherche FTS5 match
        cursor = self.conn.cursor()
        try:
            # Recherche FTS5 match
            clean_query = query.replace('"', '""').strip()
            rows = cursor.execute(
                """
                SELECT m.id, m.project_id, m.scope, m.key, m.content, m.updated_at
                FROM memories_fts fts
                JOIN memories m ON m.key = fts.key AND m.project_id = fts.project_id
                WHERE memories_fts MATCH ? AND m.project_id = ?
                ORDER BY rank
                LIMIT ?
                """,
                (f'"{clean_query}"*', project_id, limit)
            ).fetchall()
            return [dict(r) for r in rows]
        except Exception:
            # Fallback en LIKE standard si FTS match syntaxe échoue
            rows = cursor.execute(
                """
                SELECT id, project_id, scope, key, content, updated_at
                FROM memories
                WHERE project_id = ? AND (key LIKE ? OR content LIKE ?)
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (project_id, f"%{query}%", f"%{query}%", limit)
            ).fetchall()
            return [dict(r) for r in rows]

