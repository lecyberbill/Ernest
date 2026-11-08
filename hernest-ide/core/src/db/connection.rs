use std::path::{Path, PathBuf};
use std::fs;
use rusqlite::{Connection, Result};
use super::schema::SCHEMA_SQL;

pub fn get_data_dir() -> PathBuf {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    
    let dir = home.join(".local").join("share").join("agent-manager");
    fs::create_dir_all(&dir).ok();
    dir
}

pub fn get_db_path() -> PathBuf {
    get_data_dir().join("data.db")
}

pub fn get_connection(path_opt: Option<&Path>) -> Result<Connection> {
    let db_path = match path_opt {
        Some(p) => p.to_path_buf(),
        None => get_db_path(),
    };

    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&db_path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;"
    )?;
    Ok(conn)
}

pub fn init_db(path_opt: Option<&Path>) -> Result<Connection> {
    let conn = get_connection(path_opt)?;
    conn.execute_batch(SCHEMA_SQL)?;
    Ok(conn)
}

