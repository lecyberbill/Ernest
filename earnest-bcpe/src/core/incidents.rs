use std::path::Path;

use rusqlite::{params, Connection};

use crate::config::AppConfig;
use crate::core::queries::ensure_product;
use crate::core::redact::redact_text;
use crate::core::search::search;
use crate::core::time::now_iso;
use crate::error::{KbError, KbResult};
use crate::models::{IncidentInput, IncidentReport, SearchInput};

pub fn report_incident(
    conn: &mut Connection,
    config: &AppConfig,
    input: &IncidentInput,
    actor: &str,
) -> KbResult<IncidentReport> {
    ensure_product(conn, &input.product_id)?;
    if input.expected.trim().is_empty() {
        return Err(KbError::invalid("expected ne peut pas être vide"));
    }
    if input.observed.trim().is_empty() {
        return Err(KbError::invalid("observed ne peut pas être vide"));
    }
    if input
        .log_excerpt
        .as_deref()
        .map(|v| v.chars().count())
        .unwrap_or(0)
        > 4000
    {
        return Err(KbError::invalid("log_excerpt limité à 4000 caractères"));
    }

    let expected = redact_text(config, &input.expected);
    let observed = redact_text(config, &input.observed);
    let log_excerpt = input
        .log_excerpt
        .as_ref()
        .map(|value| redact_text(config, value));
    let timestamp = now_iso();

    conn.execute(
        "INSERT INTO incidents
         (product_id, script_ref, expected, observed, log_excerpt, state, entry_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'ouvert', NULL, ?6)",
        params![
            input.product_id,
            input.script_ref,
            expected,
            observed,
            log_excerpt,
            timestamp
        ],
    )
    .map_err(KbError::Db)?;
    let incident_id = conn.last_insert_rowid();

    let query = format!("{} {}", input.expected, input.observed);
    let nearby = search(
        conn,
        &SearchInput {
            product_id: input.product_id.clone(),
            query: Some(query),
            terms: Vec::new(),
            kinds: Vec::new(),
            limit: Some(5),
            offset: None,
        },
    )?;

    let _ = actor;

    Ok(IncidentReport {
        incident_id,
        nearby: nearby.results,
        covered: nearby.covered,
    })
}

pub fn log_extract(path: &Path) -> KbResult<String> {
    let content = std::fs::read_to_string(path).map_err(KbError::Io)?;
    let lines: Vec<&str> = content.lines().collect();
    let mut keep = vec![false; lines.len()];
    for (index, line) in lines.iter().enumerate() {
        let level = line.split('|').nth(1).unwrap_or("").trim();
        if level.eq_ignore_ascii_case("WARN") || level.eq_ignore_ascii_case("ERROR") {
            let start = index.saturating_sub(5);
            for slot in keep.iter_mut().take(index + 1).skip(start) {
                *slot = true;
            }
        }
        let step = line.split('|').nth(2).unwrap_or("").trim();
        if step.eq_ignore_ascii_case("fin") {
            keep[index] = true;
        }
    }
    let mut output = String::new();
    for (index, line) in lines.iter().enumerate() {
        if keep[index] {
            if !output.is_empty() {
                output.push('\n');
            }
            output.push_str(line);
        }
    }
    if output.chars().count() > 4000 {
        output = output.chars().take(4000).collect();
    }
    Ok(output)
}
