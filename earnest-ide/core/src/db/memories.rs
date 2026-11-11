use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryItem {
    pub id: i64,
    pub project_id: String,
    pub session_id: Option<String>,
    pub scope: String,
    pub key: String,
    pub content: String,
    pub updated_at: String,
}

pub struct MemoryService<'a> {
    pub conn: &'a Connection,
}

impl<'a> MemoryService<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn store_memory(
        &self,
        project_id: &str,
        key: &str,
        content: &str,
        scope: &str,
        session_id: Option<&str>,
    ) -> Result<String> {
        let valid_scope = if scope == "session" { "session" } else { "project" };
        let sid = if valid_scope == "session" { session_id } else { None };

        let mut stmt = self.conn.prepare(
            "SELECT id FROM memories WHERE project_id = ?1 AND scope = ?2 AND key = ?3 AND (session_id = ?4 OR (session_id IS NULL AND ?4 IS NULL))"
        )?;
        let exists = stmt.exists(params![project_id, valid_scope, key, sid])?;

        if exists {
            self.conn.execute(
                "UPDATE memories SET content = ?1, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?2 AND scope = ?3 AND key = ?4 AND (session_id = ?5 OR (session_id IS NULL AND ?5 IS NULL))",
                params![content, project_id, valid_scope, key, sid],
            )?;
        } else {
            self.conn.execute(
                "INSERT INTO memories (project_id, session_id, scope, key, content) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![project_id, sid, valid_scope, key, content],
            )?;
        }

        Ok(format!("Mémoire persistée avec succès pour la clé '{}' (scope: {})", key, valid_scope))
    }

    pub fn recall_memory(
        &self,
        project_id: &str,
        key: &str,
        session_id: Option<&str>,
    ) -> Result<Option<String>> {
        // 1. Recherche prioritaire dans la session si session_id est fourni
        if let Some(sid) = session_id {
            let mut stmt = self.conn.prepare(
                "SELECT content FROM memories WHERE project_id = ?1 AND scope = 'session' AND key = ?2 AND session_id = ?3 ORDER BY updated_at DESC LIMIT 1"
            )?;
            let mut rows = stmt.query(params![project_id, key, sid])?;
            if let Some(row) = rows.next()? {
                return Ok(Some(row.get(0)?));
            }
        }

        // 2. Recherche en fallback dans le scope projet
        let mut stmt = self.conn.prepare(
            "SELECT content FROM memories WHERE project_id = ?1 AND scope = 'project' AND key = ?2 ORDER BY updated_at DESC LIMIT 1"
        )?;
        let mut rows = stmt.query(params![project_id, key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn list_memories(&self, project_id: &str) -> Result<Vec<MemoryItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, project_id, session_id, scope, key, content, updated_at FROM memories WHERE project_id = ?1 ORDER BY updated_at DESC"
        )?;
        let rows = stmt.query_map(params![project_id], |row| {
            Ok(MemoryItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                session_id: row.get(2)?,
                scope: row.get(3)?,
                key: row.get(4)?,
                content: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r?);
        }
        Ok(items)
    }

    pub fn delete_memory(&self, memory_id: i64) -> Result<bool> {
        let count = self.conn.execute("DELETE FROM memories WHERE id = ?1", params![memory_id])?;
        Ok(count > 0)
    }
}

