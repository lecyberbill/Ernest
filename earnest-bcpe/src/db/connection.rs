use std::fs;
use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;

use crate::error::{KbError, KbResult};

pub fn open(path: &Path) -> KbResult<Connection> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(KbError::Io)?;
        }
    }
    let conn = Connection::open(path).map_err(KbError::Db)?;
    configure(&conn)?;
    Ok(conn)
}

pub fn open_in_memory() -> KbResult<Connection> {
    let conn = Connection::open_in_memory().map_err(KbError::Db)?;
    configure(&conn)?;
    Ok(conn)
}

fn configure(conn: &Connection) -> KbResult<()> {
    conn.busy_timeout(Duration::from_millis(5000))
        .map_err(KbError::Db)?;
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(KbError::Db)?;
    Ok(())
}
