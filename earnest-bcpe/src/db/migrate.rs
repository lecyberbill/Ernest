use rusqlite::Connection;

use crate::error::{KbError, KbResult};

const SCHEMA: &str = include_str!("schema.sql");

pub fn init(conn: &Connection) -> KbResult<()> {
    conn.execute_batch(SCHEMA).map_err(KbError::Db)?;
    conn.query_row("SELECT count(*) FROM entries_fts", [], |row| {
        row.get::<_, i64>(0)
    })
    .map_err(|e| KbError::Internal(format!("FTS5 indisponible dans le SQLite embarqué: {e}")))?;
    Ok(())
}
