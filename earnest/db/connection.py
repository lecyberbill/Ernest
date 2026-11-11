import os
import sqlite3
from pathlib import Path
from typing import Optional, Union
from earnest.config import get_db_path
from earnest.db.schema import SCHEMA_SQL

def get_connection(db_path: Optional[Union[str, Path]] = None) -> sqlite3.Connection:
    """Ouvre une connexion SQLite avec support WAL et clés étrangères activées."""
    if db_path is None:
        target_path = get_db_path()
    else:
        target_path = Path(db_path)
    
    target_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target_path))
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path: Optional[Union[str, Path]] = None) -> sqlite3.Connection:
    """Initialise le schéma de base de données SQLite."""
    conn = get_connection(db_path)
    with conn:
        conn.executescript(SCHEMA_SQL)
    return conn

