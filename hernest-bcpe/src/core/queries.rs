use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{KbError, KbResult};
use crate::models::{EntryRow, EntrySnapshot, IdentifierRow, LinkedEntry};

pub fn product_exists(conn: &Connection, product_id: &str) -> KbResult<bool> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM products WHERE product_id = ?1",
            params![product_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(KbError::Db)?;
    Ok(exists.is_some())
}

pub fn ensure_product(conn: &Connection, product_id: &str) -> KbResult<()> {
    if product_exists(conn, product_id)? {
        Ok(())
    } else {
        Err(KbError::UnknownProduct(format!(
            "le produit '{product_id}' n'existe pas; créez-le avant d'écrire"
        )))
    }
}

pub fn fetch_entry(conn: &Connection, entry_id: i64) -> KbResult<Option<EntryRow>> {
    conn.query_row(
        "SELECT * FROM entries WHERE entry_id = ?1",
        params![entry_id],
        EntryRow::from_row,
    )
    .optional()
    .map_err(KbError::Db)
}

pub fn fetch_entry_by_subject(
    conn: &Connection,
    product_id: &str,
    subject_key: &str,
) -> KbResult<Option<EntryRow>> {
    conn.query_row(
        "SELECT * FROM entries WHERE product_id = ?1 AND subject_key = ?2",
        params![product_id, subject_key],
        EntryRow::from_row,
    )
    .optional()
    .map_err(KbError::Db)
}

pub fn fetch_terms(conn: &Connection, entry_id: i64) -> KbResult<Vec<String>> {
    let mut stmt = conn
        .prepare("SELECT term FROM entry_terms WHERE entry_id = ?1 ORDER BY term COLLATE NOCASE")
        .map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params![entry_id], |row| row.get::<_, String>(0))
        .map_err(KbError::Db)?;
    let mut terms = Vec::new();
    for row in rows {
        terms.push(row.map_err(KbError::Db)?);
    }
    Ok(terms)
}

pub fn fetch_identifiers(conn: &Connection, entry_id: i64) -> KbResult<Vec<IdentifierRow>> {
    let mut stmt = conn
        .prepare(
            "SELECT entry_id, product_id, identifier, state, replaced_by FROM identifiers
             WHERE entry_id = ?1 ORDER BY identifier COLLATE NOCASE",
        )
        .map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params![entry_id], |row| {
            Ok(IdentifierRow {
                entry_id: row.get(0)?,
                product_id: row.get(1)?,
                identifier: row.get(2)?,
                state: row.get(3)?,
                replaced_by: row.get(4)?,
            })
        })
        .map_err(KbError::Db)?;
    let mut identifiers = Vec::new();
    for row in rows {
        identifiers.push(row.map_err(KbError::Db)?);
    }
    Ok(identifiers)
}

pub fn fetch_depends_on(conn: &Connection, entry_id: i64) -> KbResult<Vec<i64>> {
    let mut stmt = conn
        .prepare("SELECT depends_on_id FROM entry_deps WHERE entry_id = ?1 ORDER BY depends_on_id")
        .map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params![entry_id], |row| row.get::<_, i64>(0))
        .map_err(KbError::Db)?;
    let mut deps = Vec::new();
    for row in rows {
        deps.push(row.map_err(KbError::Db)?);
    }
    Ok(deps)
}

pub fn snapshot_entry(conn: &Connection, entry: &EntryRow) -> KbResult<EntrySnapshot> {
    Ok(EntrySnapshot {
        entry: entry.clone(),
        terms: fetch_terms(conn, entry.entry_id)?,
        identifiers: fetch_identifiers(conn, entry.entry_id)?,
        depends_on: fetch_depends_on(conn, entry.entry_id)?,
    })
}

pub fn update_fts(conn: &Connection, entry_id: i64) -> KbResult<()> {
    let entry = fetch_entry(conn, entry_id)?
        .ok_or_else(|| KbError::NotFound(format!("entrée {entry_id} introuvable")))?;
    let terms: String = conn
        .query_row(
            "SELECT COALESCE(GROUP_CONCAT(term, ' '), '') FROM entry_terms WHERE entry_id = ?1",
            params![entry_id],
            |row| row.get(0),
        )
        .map_err(KbError::Db)?;
    conn.execute(
        "DELETE FROM entries_fts WHERE rowid = ?1",
        params![entry_id],
    )
    .map_err(KbError::Db)?;
    conn.execute(
        "INSERT INTO entries_fts (rowid, title, symptom, cause, correction, terms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            entry_id,
            entry.title,
            entry.symptom.unwrap_or_default(),
            entry.cause.unwrap_or_default(),
            entry.correction,
            terms
        ],
    )
    .map_err(KbError::Db)?;
    Ok(())
}

pub fn replace_terms(conn: &Connection, entry_id: i64, terms: &[String]) -> KbResult<()> {
    conn.execute(
        "DELETE FROM entry_terms WHERE entry_id = ?1",
        params![entry_id],
    )
    .map_err(KbError::Db)?;
    let mut seen = std::collections::HashSet::new();
    for term in terms {
        let trimmed = term.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        conn.execute(
            "INSERT INTO entry_terms (entry_id, term) VALUES (?1, ?2)",
            params![entry_id, trimmed],
        )
        .map_err(KbError::Db)?;
    }
    Ok(())
}

pub fn replace_identifiers(
    conn: &Connection,
    entry_id: i64,
    product_id: &str,
    identifiers: &[IdentifierRow],
) -> KbResult<()> {
    conn.execute(
        "DELETE FROM identifiers WHERE entry_id = ?1",
        params![entry_id],
    )
    .map_err(KbError::Db)?;
    let mut seen = std::collections::HashSet::new();
    for item in identifiers {
        let key = item.identifier.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        conn.execute(
            "INSERT INTO identifiers (entry_id, product_id, identifier, state, replaced_by)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                entry_id,
                product_id,
                item.identifier,
                item.state,
                item.replaced_by
            ],
        )
        .map_err(KbError::Db)?;
    }
    Ok(())
}

pub fn replace_depends_on(conn: &Connection, entry_id: i64, deps: &[i64]) -> KbResult<()> {
    conn.execute(
        "DELETE FROM entry_deps WHERE entry_id = ?1",
        params![entry_id],
    )
    .map_err(KbError::Db)?;
    let mut seen = std::collections::HashSet::new();
    for dep in deps {
        if !seen.insert(*dep) {
            continue;
        }
        conn.execute(
            "INSERT INTO entry_deps (entry_id, depends_on_id) VALUES (?1, ?2)",
            params![entry_id, dep],
        )
        .map_err(KbError::Db)?;
    }
    Ok(())
}

pub fn linked_entries(
    conn: &Connection,
    product_id: &str,
    identifier: &str,
) -> KbResult<Vec<LinkedEntry>> {
    let mut stmt = conn
        .prepare(
            "SELECT e.entry_id, e.subject_key, e.title, e.status, i.state, i.replaced_by, e.correction
             FROM identifiers i
             JOIN entries e ON e.entry_id = i.entry_id
             WHERE i.product_id = ?1 AND i.identifier = ?2 AND e.status <> 'archive'
             ORDER BY e.entry_id",
        )
        .map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params![product_id, identifier], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(KbError::Db)?;
    let mut output = Vec::new();
    for row in rows {
        let (entry_id, subject_key, title, status, state, replaced_by, correction) =
            row.map_err(KbError::Db)?;
        output.push(LinkedEntry {
            entry_id,
            subject_key,
            title,
            status,
            state,
            replaced_by,
            correction: Some(correction),
        });
    }
    Ok(output)
}

pub fn truncate_chars(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        return value.to_string();
    }
    value.chars().take(max).collect()
}
