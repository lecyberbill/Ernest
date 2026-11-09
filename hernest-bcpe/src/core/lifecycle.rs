use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection};

use crate::config::AppConfig;
use crate::core::entries::{
    check_identifier_conflicts, identifiers_from_inputs, validate_depends, validate_kind,
};
use crate::core::queries::{
    ensure_product, fetch_depends_on, fetch_entry, replace_depends_on, replace_identifiers,
    replace_terms, snapshot_entry, update_fts,
};
use crate::core::redact::redact_text;
use crate::core::time::{days_ago_iso, now_iso};
use crate::core::version::{is_valid_version, versions_equal};
use crate::error::{KbError, KbResult};
use crate::models::{IdentifierInput, LintFinding, OutcomeInput, OutcomeResult};

fn require_entry(conn: &Connection, entry_id: i64) -> KbResult<crate::models::EntryRow> {
    fetch_entry(conn, entry_id)?
        .ok_or_else(|| KbError::NotFound(format!("l'entrée {entry_id} n'existe pas")))
}

pub fn validate(
    conn: &mut Connection,
    entry_id: i64,
    validator: &str,
) -> KbResult<crate::models::EntryRow> {
    let entry = require_entry(conn, entry_id)?;
    if !matches!(entry.status.as_str(), "non_teste" | "a_revoir") {
        return Err(KbError::ForbiddenStatus(format!(
            "transition {} -> valide refusée; seules les entrées non_teste ou a_revoir peuvent être validées",
            entry.status
        )));
    }
    if validator.trim().is_empty() {
        return Err(KbError::invalid("le nom du valideur est obligatoire"));
    }
    conn.execute(
        "UPDATE entries SET status='valide', validated_by=?1, validated_at=?2, updated_at=?2
         WHERE entry_id=?3",
        params![validator, now_iso(), entry_id],
    )
    .map_err(KbError::Db)?;
    require_entry(conn, entry_id)
}

pub fn archive(conn: &mut Connection, entry_id: i64) -> KbResult<crate::models::EntryRow> {
    let entry = require_entry(conn, entry_id)?;
    if entry.status == "archive" {
        return Err(KbError::ForbiddenStatus(
            "l'entrée est déjà archivée".to_string(),
        ));
    }
    conn.execute(
        "UPDATE entries SET status='archive' WHERE entry_id=?1",
        params![entry_id],
    )
    .map_err(KbError::Db)?;
    require_entry(conn, entry_id)
}

pub fn restore(conn: &mut Connection, entry_id: i64) -> KbResult<crate::models::EntryRow> {
    let entry = require_entry(conn, entry_id)?;
    if entry.status != "archive" {
        return Err(KbError::ForbiddenStatus(format!(
            "restore exige une entrée archive (statut courant: {})",
            entry.status
        )));
    }
    conn.execute(
        "UPDATE entries SET status='non_teste', validated_by=NULL, validated_at=NULL,
         updated_at=?1 WHERE entry_id=?2",
        params![now_iso(), entry_id],
    )
    .map_err(KbError::Db)?;
    require_entry(conn, entry_id)
}

#[derive(Debug, Default, Clone)]
pub struct EditPatch {
    pub kind: Option<String>,
    pub title: Option<String>,
    pub symptom: Option<String>,
    pub cause: Option<String>,
    pub correction: Option<String>,
    pub example: Option<String>,
    pub terms: Option<Vec<String>>,
    pub identifiers: Option<Vec<IdentifierInput>>,
    pub depends_on: Option<Vec<i64>>,
    pub product_version: Option<String>,
}

fn char_len(value: &str) -> usize {
    value.chars().count()
}

fn optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        if text.trim().is_empty() {
            None
        } else {
            Some(text)
        }
    })
}

pub fn edit(
    conn: &mut Connection,
    config: &AppConfig,
    entry_id: i64,
    patch: &EditPatch,
    editor: &str,
) -> KbResult<crate::models::EntryRow> {
    let existing = require_entry(conn, entry_id)?;
    if existing.status == "archive" {
        return Err(KbError::ForbiddenStatus(
            "une entrée archivée se modifie après restauration (kb restore)".to_string(),
        ));
    }
    if editor.trim().is_empty() {
        return Err(KbError::invalid("le nom de l'éditeur est obligatoire"));
    }

    let kind = patch.kind.clone().unwrap_or_else(|| existing.kind.clone());
    validate_kind(&kind)?;

    let title = redact_text(config, patch.title.as_deref().unwrap_or(&existing.title));
    let correction = redact_text(
        config,
        patch.correction.as_deref().unwrap_or(&existing.correction),
    );
    let symptom = optional_text(
        patch
            .symptom
            .clone()
            .or_else(|| existing.symptom.clone())
            .map(|value| redact_text(config, &value)),
    );
    let cause = optional_text(
        patch
            .cause
            .clone()
            .or_else(|| existing.cause.clone())
            .map(|value| redact_text(config, &value)),
    );
    let example = optional_text(
        patch
            .example
            .clone()
            .or_else(|| existing.example.clone())
            .map(|value| redact_text(config, &value)),
    );
    let product_version = match patch.product_version.clone() {
        None => existing.product_version.clone(),
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(value),
    };
    if let Some(version) = &product_version {
        if !is_valid_version(version) {
            return Err(KbError::invalid(format!(
                "product_version '{version}' invalide; segments numériques séparés par des points attendus"
            )));
        }
    }

    if char_len(&title) > 120 {
        return Err(KbError::invalid("title limité à 120 caractères"));
    }
    if char_len(&correction) > 4000 {
        return Err(KbError::invalid("correction limitée à 4000 caractères"));
    }
    if example.as_deref().map(char_len).unwrap_or(0) > 2000 {
        return Err(KbError::invalid("example limité à 2000 caractères"));
    }
    if symptom.as_deref().map(char_len).unwrap_or(0) > 1000 {
        return Err(KbError::invalid("symptom limité à 1000 caractères"));
    }
    if cause.as_deref().map(char_len).unwrap_or(0) > 1000 {
        return Err(KbError::invalid("cause limité à 1000 caractères"));
    }

    let identifiers = match &patch.identifiers {
        Some(items) => Some(identifiers_from_inputs(&existing.product_id, items)?),
        None => None,
    };
    let deps = patch
        .depends_on
        .clone()
        .unwrap_or_else(|| fetch_depends_on(conn, entry_id).unwrap_or_default());

    let timestamp = now_iso();
    let tx = conn.transaction().map_err(KbError::Db)?;
    validate_depends(&tx, &existing.product_id, &deps, entry_id)?;
    if let Some(items) = &identifiers {
        check_identifier_conflicts(&tx, &existing.product_id, items, entry_id)?;
    }

    let snapshot = snapshot_entry(&tx, &existing)?;
    let snapshot_json = serde_json::to_string(&snapshot)?;
    tx.execute(
        "INSERT INTO entry_history (entry_id, version, snapshot, changed_by, reason, changed_at)
         VALUES (?1, ?2, ?3, ?4, 'kb_edit', ?5)",
        params![entry_id, existing.version, snapshot_json, editor, timestamp],
    )
    .map_err(KbError::Db)?;

    let was_valid = existing.status == "valide";
    let (validated_by, validated_at) = if was_valid {
        (Some(editor.to_string()), Some(timestamp.clone()))
    } else {
        (existing.validated_by.clone(), existing.validated_at.clone())
    };

    tx.execute(
        "UPDATE entries SET kind=?1, title=?2, symptom=?3, cause=?4, correction=?5,
            example=?6, product_version=?7, version=version+1, updated_at=?8,
            validated_by=?9, validated_at=?10
         WHERE entry_id=?11",
        params![
            kind,
            title,
            symptom,
            cause,
            correction,
            example,
            product_version,
            timestamp,
            validated_by,
            validated_at,
            entry_id
        ],
    )
    .map_err(KbError::Db)?;

    if let Some(terms) = &patch.terms {
        replace_terms(&tx, entry_id, terms)?;
    }
    if let Some(items) = &identifiers {
        replace_identifiers(&tx, entry_id, &existing.product_id, items)?;
    }
    if patch.depends_on.is_some() {
        replace_depends_on(&tx, entry_id, &deps)?;
    }
    update_fts(&tx, entry_id)?;
    tx.commit().map_err(KbError::Db)?;

    require_entry(conn, entry_id)
}

pub fn product_version(
    conn: &mut Connection,
    product_id: &str,
    version: &str,
) -> KbResult<Vec<i64>> {
    ensure_product(conn, product_id)?;
    if !is_valid_version(version) {
        return Err(KbError::invalid(format!(
            "version '{version}' invalide; segments numériques séparés par des points attendus"
        )));
    }
    let tx = conn.transaction().map_err(KbError::Db)?;
    tx.execute(
        "UPDATE products SET current_version=?1 WHERE product_id=?2",
        params![version, product_id],
    )
    .map_err(KbError::Db)?;

    let mut to_review = Vec::new();
    {
        let mut stmt = tx
            .prepare(
                "SELECT entry_id, product_version FROM entries
                 WHERE product_id=?1 AND status='valide' AND product_version IS NOT NULL",
            )
            .map_err(KbError::Db)?;
        let rows = stmt
            .query_map(params![product_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(KbError::Db)?;
        for row in rows {
            let (entry_id, entry_version) = row.map_err(KbError::Db)?;
            if !versions_equal(&entry_version, version) {
                to_review.push(entry_id);
            }
        }
    }
    let timestamp = now_iso();
    for entry_id in &to_review {
        tx.execute(
            "UPDATE entries SET status='a_revoir', updated_at=?1 WHERE entry_id=?2",
            params![timestamp, entry_id],
        )
        .map_err(KbError::Db)?;
    }
    tx.commit().map_err(KbError::Db)?;
    Ok(to_review)
}

fn product_filter(product: Option<&str>, alias: &str) -> (String, Vec<Value>) {
    match product {
        Some(value) => (
            format!(" AND {alias}.product_id = ?"),
            vec![Value::Text(value.to_string())],
        ),
        None => (String::new(), Vec::new()),
    }
}

pub fn lint(conn: &Connection, product: Option<&str>) -> KbResult<Vec<LintFinding>> {
    let mut findings = Vec::new();

    let (filter, values) = product_filter(product, "e");
    let sql = format!(
        "SELECT e.entry_id, e.product_id, e.subject_key FROM entries e
         WHERE e.status <> 'archive'
           AND NOT EXISTS (SELECT 1 FROM entry_terms t WHERE t.entry_id = e.entry_id){filter}"
    );
    let mut stmt = conn.prepare(&sql).map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(KbError::Db)?;
    for row in rows {
        let (entry_id, product_id, subject_key) = row.map_err(KbError::Db)?;
        findings.push(LintFinding {
            category: "sans_mot_cle",
            product_id,
            entry_id: Some(entry_id),
            identifier: None,
            detail: format!("l'entrée '{subject_key}' n'a aucun mot-clé"),
        });
    }

    let (filter, values) = product_filter(product, "e");
    let sql = format!(
        "SELECT d.entry_id, d.depends_on_id, e.product_id FROM entry_deps d
         JOIN entries e ON e.entry_id = d.entry_id
         JOIN entries dep ON dep.entry_id = d.depends_on_id
         WHERE dep.status = 'archive'{filter}"
    );
    let mut stmt = conn.prepare(&sql).map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(KbError::Db)?;
    for row in rows {
        let (entry_id, dep_id, product_id) = row.map_err(KbError::Db)?;
        findings.push(LintFinding {
            category: "dependance_archivee",
            product_id,
            entry_id: Some(entry_id),
            identifier: None,
            detail: format!("l'entrée dépend de l'entrée archivée {dep_id}"),
        });
    }

    let (filter, values) = product_filter(product, "i");
    let sql = format!(
        "SELECT i.entry_id, i.product_id, i.identifier, i.state FROM identifiers i
         JOIN entries e ON e.entry_id = i.entry_id
         JOIN lexicon_identifiers l ON l.product_id = i.product_id AND l.identifier = i.identifier
         WHERE i.state IN ('deprecie','inexistant') AND e.status <> 'archive'{filter}"
    );
    let mut stmt = conn.prepare(&sql).map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(KbError::Db)?;
    for row in rows {
        let (entry_id, product_id, identifier, state) = row.map_err(KbError::Db)?;
        findings.push(LintFinding {
            category: "identifiant_signale_dans_lexique",
            product_id,
            entry_id: Some(entry_id),
            identifier: Some(identifier.clone()),
            detail: format!(
                "l'identifiant '{identifier}' est déclaré '{state}' alors qu'il figure dans le lexique"
            ),
        });
    }

    let (filter, values) = product_filter(product, "i");
    let sql = format!(
        "SELECT i.entry_id, i.product_id, i.identifier FROM identifiers i
         JOIN entries e ON e.entry_id = i.entry_id
         WHERE e.status='valide' AND i.state='valide'
           AND EXISTS (SELECT 1 FROM lexicon_identifiers l WHERE l.product_id = i.product_id)
           AND NOT EXISTS (SELECT 1 FROM lexicon_identifiers l2
                           WHERE l2.product_id = i.product_id AND l2.identifier = i.identifier){filter}"
    );
    let mut stmt = conn.prepare(&sql).map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(KbError::Db)?;
    for row in rows {
        let (entry_id, product_id, identifier) = row.map_err(KbError::Db)?;
        findings.push(LintFinding {
            category: "valide_absent_du_lexique",
            product_id,
            entry_id: Some(entry_id),
            identifier: Some(identifier.clone()),
            detail: format!(
                "l'identifiant '{identifier}' est déclaré valide mais absent du lexique du produit"
            ),
        });
    }

    let (filter, values) = product_filter(product, "entries");
    let sql = format!(
        "SELECT entry_id, product_id, subject_key, fail_count, status FROM entries
         WHERE status IN ('non_teste','a_revoir') AND fail_count > 0{filter}"
    );
    let mut stmt = conn.prepare(&sql).map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(KbError::Db)?;
    for row in rows {
        let (entry_id, product_id, subject_key, fail_count, status) = row.map_err(KbError::Db)?;
        findings.push(LintFinding {
            category: "non_teste_avec_echecs",
            product_id,
            entry_id: Some(entry_id),
            identifier: None,
            detail: format!(
                "l'entrée '{subject_key}' ({status}) a {fail_count} échec(s) signalé(s)"
            ),
        });
    }

    let cutoff_old = days_ago_iso(30);
    let (filter, mut values) = product_filter(product, "entries");
    values.insert(0, Value::Text(cutoff_old));
    let sql = format!(
        "SELECT entry_id, product_id, subject_key, created_at FROM entries
         WHERE status='non_teste' AND created_at < ?{filter}"
    );
    let mut stmt = conn.prepare(&sql).map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(KbError::Db)?;
    for row in rows {
        let (entry_id, product_id, subject_key, created_at) = row.map_err(KbError::Db)?;
        findings.push(LintFinding {
            category: "non_teste_ancienne",
            product_id,
            entry_id: Some(entry_id),
            identifier: None,
            detail: format!(
                "l'entrée '{subject_key}' est non_teste depuis le {created_at} (plus de 30 jours)"
            ),
        });
    }

    let cutoff_unused = days_ago_iso(365);
    let (filter, mut values) = product_filter(product, "entries");
    values.insert(0, Value::Text(cutoff_unused));
    let sql = format!(
        "SELECT entry_id, product_id, subject_key, updated_at FROM entries
         WHERE status='valide' AND use_count=0 AND updated_at < ?{filter}"
    );
    let mut stmt = conn.prepare(&sql).map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(KbError::Db)?;
    for row in rows {
        let (entry_id, product_id, subject_key, updated_at) = row.map_err(KbError::Db)?;
        findings.push(LintFinding {
            category: "valide_jamais_utilisee",
            product_id,
            entry_id: Some(entry_id),
            identifier: None,
            detail: format!(
                "l'entrée '{subject_key}' est valide, jamais utilisée, inchangée depuis le {updated_at}"
            ),
        });
    }

    Ok(findings)
}

pub fn audit_sample(conn: &Connection, sample: i64) -> KbResult<Vec<crate::models::EntryRow>> {
    if sample <= 0 {
        return Err(KbError::invalid("sample doit être un entier positif"));
    }
    let mut stmt = conn
        .prepare("SELECT * FROM entries WHERE status='valide' ORDER BY RANDOM() LIMIT ?1")
        .map_err(KbError::Db)?;
    let rows = stmt
        .query_map(params![sample], crate::models::EntryRow::from_row)
        .map_err(KbError::Db)?;
    let mut output = Vec::new();
    for row in rows {
        output.push(row.map_err(KbError::Db)?);
    }
    Ok(output)
}

pub fn backup(conn: &Connection, data_dir: &Path) -> KbResult<PathBuf> {
    let dir = data_dir.join("backups");
    fs::create_dir_all(&dir).map_err(KbError::Io)?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let path = dir.join(format!("kb-{stamp}.db"));
    let path_text = path.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", params![path_text])
        .map_err(KbError::Db)?;
    prune_backups(&dir, 30)?;
    Ok(path)
}

fn prune_backups(dir: &Path, days: i64) -> KbResult<()> {
    let cutoff = std::time::SystemTime::now()
        - std::time::Duration::from_secs((days.max(0) as u64) * 86_400);
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if modified < cutoff {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
    Ok(())
}

pub fn reindex(conn: &mut Connection) -> KbResult<usize> {
    let mut ids = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT entry_id FROM entries ORDER BY entry_id")
            .map_err(KbError::Db)?;
        let rows = stmt
            .query_map([], |row| row.get::<_, i64>(0))
            .map_err(KbError::Db)?;
        for row in rows {
            ids.push(row.map_err(KbError::Db)?);
        }
    }
    let tx = conn.transaction().map_err(KbError::Db)?;
    tx.execute("DELETE FROM entries_fts", [])
        .map_err(KbError::Db)?;
    for entry_id in &ids {
        update_fts(&tx, *entry_id)?;
    }
    tx.commit().map_err(KbError::Db)?;
    Ok(ids.len())
}

pub fn import_lexicon(conn: &mut Connection, product_id: &str, file: &Path) -> KbResult<usize> {
    conn.execute(
        "INSERT OR IGNORE INTO products (product_id, name) VALUES (?1, ?1)",
        params![product_id],
    )
    .map_err(KbError::Db)?;
    let content = fs::read_to_string(file).map_err(KbError::Io)?;
    let mut seen = HashSet::new();
    let mut identifiers = Vec::new();
    for line in content.lines() {
        let value = line.trim();
        if value.is_empty() {
            continue;
        }
        if seen.insert(value.to_lowercase()) {
            identifiers.push(value.to_string());
        }
    }
    let tx = conn.transaction().map_err(KbError::Db)?;
    tx.execute(
        "DELETE FROM lexicon_identifiers WHERE product_id=?1",
        params![product_id],
    )
    .map_err(KbError::Db)?;
    for identifier in &identifiers {
        tx.execute(
            "INSERT INTO lexicon_identifiers (product_id, identifier) VALUES (?1, ?2)",
            params![product_id, identifier],
        )
        .map_err(KbError::Db)?;
    }
    tx.commit().map_err(KbError::Db)?;
    Ok(identifiers.len())
}

pub fn record_outcome(
    conn: &mut Connection,
    config: &AppConfig,
    input: &OutcomeInput,
    actor: &str,
) -> KbResult<OutcomeResult> {
    let entry = require_entry(conn, input.entry_id)?;
    match input.outcome.as_str() {
        "ok" | "ko" => {}
        other => {
            return Err(KbError::invalid(format!(
                "outcome '{other}' invalide; valeurs admises: ok, ko"
            )))
        }
    }
    let note = input
        .note
        .as_ref()
        .map(|value| redact_text(config, value))
        .filter(|value| !value.trim().is_empty());
    if input.outcome == "ko" && note.is_none() {
        return Err(KbError::invalid(
            "outcome 'ko' exige une note décrivant la cause constatée",
        ));
    }
    if note.as_deref().map(char_len).unwrap_or(0) > 4000 {
        return Err(KbError::invalid("note limitée à 4000 caractères"));
    }

    let timestamp = now_iso();
    let tx = conn.transaction().map_err(KbError::Db)?;
    tx.execute(
        "INSERT INTO entry_outcomes (entry_id, outcome, note, actor, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![entry.entry_id, input.outcome, note, actor, timestamp],
    )
    .map_err(KbError::Db)?;
    if input.outcome == "ok" {
        tx.execute(
            "UPDATE entries SET use_count = use_count + 1 WHERE entry_id = ?1",
            params![entry.entry_id],
        )
        .map_err(KbError::Db)?;
    } else {
        tx.execute(
            "UPDATE entries SET fail_count = fail_count + 1,
                status = CASE WHEN status='valide' THEN 'a_revoir' ELSE status END
             WHERE entry_id = ?1",
            params![entry.entry_id],
        )
        .map_err(KbError::Db)?;
    }
    tx.commit().map_err(KbError::Db)?;

    let updated = require_entry(conn, entry.entry_id)?;
    Ok(OutcomeResult {
        entry_id: updated.entry_id,
        use_count: updated.use_count,
        fail_count: updated.fail_count,
        status: updated.status,
        version: updated.version,
    })
}
