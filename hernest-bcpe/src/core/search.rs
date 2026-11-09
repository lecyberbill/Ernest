use rusqlite::params_from_iter;
use rusqlite::types::Value;
use rusqlite::Connection;

use crate::core::queries::{ensure_product, truncate_chars};
use crate::error::{KbError, KbResult};
use crate::models::{EntrySummary, SearchInput, SearchResponse};

const COVERED_MESSAGE: &str =
    "non couvert ou non validé : vérifier dans la documentation du produit";

fn validate_kinds(kinds: &[String]) -> KbResult<()> {
    for kind in kinds {
        match kind.as_str() {
            "catalogue" | "piege" | "regle" => {}
            other => {
                return Err(KbError::invalid(format!(
                    "kind '{other}' invalide; valeurs admises: catalogue, piege, regle"
                )))
            }
        }
    }
    Ok(())
}

fn build_match_expression(query: Option<&str>, terms: &[String]) -> KbResult<String> {
    let mut tokens: Vec<String> = Vec::new();
    if let Some(query) = query {
        for token in query.split_whitespace() {
            if !token.is_empty() {
                tokens.push(token.to_string());
            }
        }
    }
    for term in terms {
        for token in term.split_whitespace() {
            if !token.is_empty() {
                tokens.push(token.to_string());
            }
        }
    }
    if tokens.is_empty() {
        return Err(KbError::invalid(
            "query ou terms[] doit fournir au moins un mot recherché",
        ));
    }
    let quoted: Vec<String> = tokens
        .iter()
        .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
        .collect();
    Ok(quoted.join(" OR "))
}

fn build_excerpt(correction: &str, symptom: Option<&str>) -> String {
    let base = if !correction.trim().is_empty() {
        correction
    } else {
        symptom.unwrap_or("")
    };
    let flattened = base.split_whitespace().collect::<Vec<_>>().join(" ");
    truncate_chars(&flattened, 220)
}

pub fn search(conn: &Connection, input: &SearchInput) -> KbResult<SearchResponse> {
    ensure_product(conn, &input.product_id)?;
    validate_kinds(&input.kinds)?;

    let limit = match input.limit {
        None => 5,
        Some(value) if (1..=20).contains(&value) => value,
        Some(_) => {
            return Err(KbError::invalid(
                "limit doit être comprise entre 1 et 20 (5 par défaut)",
            ))
        }
    };
    let offset = match input.offset {
        None => 0,
        Some(value) if value >= 0 => value,
        Some(_) => return Err(KbError::invalid("offset doit être positif ou nul")),
    };

    let match_expr = build_match_expression(input.query.as_deref(), &input.terms)?;

    let mut where_sql =
        String::from("entries_fts MATCH ? AND e.product_id = ? AND e.status <> 'archive'");
    let mut base_values: Vec<Value> = vec![
        Value::Text(match_expr),
        Value::Text(input.product_id.clone()),
    ];
    if !input.kinds.is_empty() {
        let placeholders = vec!["?"; input.kinds.len()].join(", ");
        where_sql.push_str(&format!(" AND e.kind IN ({placeholders})"));
        for kind in &input.kinds {
            base_values.push(Value::Text(kind.clone()));
        }
    }

    let from_sql = "FROM entries_fts JOIN entries e ON e.entry_id = entries_fts.rowid";

    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) {from_sql} WHERE {where_sql}"),
            params_from_iter(base_values.iter()),
            |row| row.get(0),
        )
        .map_err(KbError::Db)?;

    let covered: bool = conn
        .query_row(
            &format!(
                "SELECT EXISTS(SELECT 1 {from_sql} WHERE {where_sql} AND e.status = 'valide')"
            ),
            params_from_iter(base_values.iter()),
            |row| row.get::<_, i64>(0),
        )
        .map_err(KbError::Db)?
        != 0;

    let mut page_values = base_values.clone();
    page_values.push(Value::Integer(limit));
    page_values.push(Value::Integer(offset));
    let sql = format!(
        "SELECT e.entry_id, e.subject_key, e.title, e.kind, e.status, e.version,
                e.correction, e.symptom, bm25(entries_fts) AS rank
         {from_sql}
         WHERE {where_sql}
         ORDER BY CASE e.status
                    WHEN 'valide' THEN 0
                    WHEN 'non_teste' THEN 1
                    WHEN 'a_revoir' THEN 2
                    ELSE 3
                  END,
                  rank ASC, e.entry_id ASC
         LIMIT ? OFFSET ?"
    );
    let mut stmt = conn.prepare(&sql).map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params_from_iter(page_values.iter()), |row| {
            let correction: String = row.get(6)?;
            let symptom: Option<String> = row.get(7)?;
            let rank: f64 = row.get(8)?;
            Ok(EntrySummary {
                entry_id: row.get(0)?,
                subject_key: row.get(1)?,
                title: row.get(2)?,
                kind: row.get(3)?,
                status: row.get(4)?,
                version: row.get(5)?,
                excerpt: build_excerpt(&correction, symptom.as_deref()),
                score: -rank,
            })
        })
        .map_err(KbError::Db)?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(KbError::Db)?);
    }

    let more_available = total > offset + results.len() as i64;
    let message = if covered {
        None
    } else {
        Some(COVERED_MESSAGE.to_string())
    };

    Ok(SearchResponse {
        results,
        covered,
        more_available,
        total,
        message,
    })
}
