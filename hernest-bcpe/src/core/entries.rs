use rusqlite::{params, Connection, OptionalExtension};

use crate::config::AppConfig;
use crate::core::queries::{
    ensure_product, fetch_depends_on, fetch_entry, fetch_entry_by_subject, fetch_identifiers,
    fetch_terms, replace_depends_on, replace_identifiers, replace_terms, snapshot_entry,
    truncate_chars, update_fts,
};
use crate::core::redact::redact_text;
use crate::core::time::now_iso;
use crate::core::version::is_valid_version;
use crate::error::{KbError, KbResult};
use crate::models::{
    EntryFull, EntrySummary, GetInput, IdentifierRow, ProposeInput, ProposeResult,
};

#[derive(Debug, Clone)]
pub struct ProposeContext {
    pub consulted: bool,
    pub actor: String,
}

fn char_len(value: &str) -> usize {
    value.chars().count()
}

fn validate_subject_key(key: &str) -> KbResult<()> {
    let valid = !key.is_empty()
        && key
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !key.starts_with('-')
        && !key.ends_with('-')
        && !key.contains("--");
    if valid {
        Ok(())
    } else {
        Err(KbError::invalid(
            "subject_key doit être un slug stable en minuscules et tirets, ex. 'attente-pause'",
        ))
    }
}

pub(crate) fn validate_kind(kind: &str) -> KbResult<()> {
    match kind {
        "catalogue" | "piege" | "regle" => Ok(()),
        other => Err(KbError::invalid(format!(
            "kind '{other}' invalide; valeurs admises: catalogue, piege, regle"
        ))),
    }
}

fn validate_state(state: &str) -> KbResult<()> {
    match state {
        "valide" | "deprecie" | "inexistant" => Ok(()),
        other => Err(KbError::invalid(format!(
            "state '{other}' invalide; valeurs admises: valide, deprecie, inexistant"
        ))),
    }
}

fn validate_limits(input: &ProposeInput) -> KbResult<()> {
    if char_len(&input.title) > 120 {
        return Err(KbError::invalid("title limité à 120 caractères"));
    }
    if char_len(&input.correction) > 4000 {
        return Err(KbError::invalid("correction limitée à 4000 caractères"));
    }
    if input.example.as_deref().map(char_len).unwrap_or(0) > 2000 {
        return Err(KbError::invalid("example limité à 2000 caractères"));
    }
    if input.symptom.as_deref().map(char_len).unwrap_or(0) > 1000 {
        return Err(KbError::invalid("symptom limité à 1000 caractères"));
    }
    if input.cause.as_deref().map(char_len).unwrap_or(0) > 1000 {
        return Err(KbError::invalid("cause limité à 1000 caractères"));
    }
    if input.title.trim().is_empty() {
        return Err(KbError::invalid("title ne peut pas être vide"));
    }
    if input.correction.trim().is_empty() {
        return Err(KbError::invalid("correction ne peut pas être vide"));
    }
    if input.source.trim().is_empty() {
        return Err(KbError::invalid("source ne peut pas être vide"));
    }
    Ok(())
}

pub(crate) fn identifiers_from_inputs(
    product_id: &str,
    inputs: &[crate::models::IdentifierInput],
) -> KbResult<Vec<IdentifierRow>> {
    let mut output: Vec<IdentifierRow> = Vec::new();
    let mut seen: std::collections::HashMap<String, (String, Option<String>)> =
        std::collections::HashMap::new();
    for item in inputs {
        let identifier = item.identifier.trim();
        if identifier.is_empty() {
            return Err(KbError::invalid("identifier ne peut pas être vide"));
        }
        validate_state(&item.state)?;
        let key = identifier.to_lowercase();
        let replaced = item
            .replaced_by
            .as_ref()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if let Some((existing_state, existing_replaced)) = seen.get(&key) {
            if existing_state != &item.state || existing_replaced != &replaced {
                return Err(KbError::invalid(format!(
                    "identifier '{identifier}' déclaré deux fois avec des états différents"
                )));
            }
            continue;
        }
        seen.insert(key, (item.state.clone(), replaced.clone()));
        output.push(IdentifierRow {
            entry_id: 0,
            product_id: product_id.to_string(),
            identifier: identifier.to_string(),
            state: item.state.clone(),
            replaced_by: replaced,
        });
    }
    Ok(output)
}

pub(crate) fn check_identifier_conflicts(
    conn: &Connection,
    product_id: &str,
    identifiers: &[IdentifierRow],
    current_entry_id: i64,
) -> KbResult<()> {
    for item in identifiers {
        let existing: Option<(i64, String, Option<String>)> = conn
            .query_row(
                "SELECT e.entry_id, i.state, i.replaced_by
                 FROM identifiers i
                 JOIN entries e ON e.entry_id = i.entry_id
                 WHERE i.product_id = ?1 AND i.identifier = ?2
                   AND e.status <> 'archive' AND i.entry_id <> ?3
                 LIMIT 1",
                params![product_id, item.identifier, current_entry_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(KbError::Db)?;
        if let Some((other_entry, other_state, other_replaced)) = existing {
            if other_state != item.state || other_replaced != item.replaced_by {
                return Err(KbError::invalid(format!(
                    "identifiant '{}' en conflit avec l'entrée {other_entry} (state={other_state}); \
                     les entrées non archivées doivent déclarer le même state et replaced_by",
                    item.identifier
                )));
            }
        }
    }
    Ok(())
}

pub(crate) fn validate_depends(
    conn: &Connection,
    product_id: &str,
    deps: &[i64],
    current_entry_id: i64,
) -> KbResult<()> {
    for dep in deps {
        if *dep == current_entry_id {
            return Err(KbError::invalid(format!(
                "depends_on ne peut pas référencer l'entrée elle-même ({dep})"
            )));
        }
        let found: Option<(String, String)> = conn
            .query_row(
                "SELECT product_id, status FROM entries WHERE entry_id = ?1",
                params![dep],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(KbError::Db)?;
        match found {
            None => {
                return Err(KbError::invalid(format!(
                    "depends_on référence l'entrée inexistante {dep}"
                )))
            }
            Some((dep_product, status)) => {
                if dep_product != product_id {
                    return Err(KbError::invalid(format!(
                        "depends_on référence l'entrée {dep} d'un autre produit ({dep_product})"
                    )));
                }
                if status == "archive" {
                    return Err(KbError::invalid(format!(
                        "depends_on référence l'entrée archivée {dep}"
                    )));
                }
            }
        }
    }
    Ok(())
}

fn insert_entry(
    conn: &Connection,
    product_id: &str,
    input: &ProposeInput,
    source: &str,
    timestamp: &str,
) -> KbResult<i64> {
    conn.execute(
        "INSERT INTO entries
         (product_id, subject_key, kind, title, symptom, cause, correction, example,
          status, product_version, source, use_count, fail_count, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'non_teste', ?9, ?10, 0, 0, 1, ?11, ?11)",
        params![
            product_id,
            input.subject_key,
            input.kind,
            input.title,
            input.symptom,
            input.cause,
            input.correction,
            input.example,
            input.product_version,
            source,
            timestamp
        ],
    )
    .map_err(KbError::Db)?;
    Ok(conn.last_insert_rowid())
}

fn incident_source_if_any(
    conn: &Connection,
    incident_id: Option<i64>,
    product_id: &str,
) -> KbResult<Option<String>> {
    match incident_id {
        None => Ok(None),
        Some(id) => {
            let found: Option<String> = conn
                .query_row(
                    "SELECT product_id FROM incidents WHERE incident_id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(KbError::Db)?;
            match found {
                None => Err(KbError::NotFound(format!("incident {id} introuvable"))),
                Some(incident_product) => {
                    if incident_product != product_id {
                        return Err(KbError::invalid(format!(
                            "l'incident {id} appartient au produit '{incident_product}', pas à '{product_id}'"
                        )));
                    }
                    Ok(Some(format!("incident:{id}")))
                }
            }
        }
    }
}

pub fn propose(
    conn: &mut Connection,
    config: &AppConfig,
    input: &ProposeInput,
    ctx: &ProposeContext,
) -> KbResult<ProposeResult> {
    ensure_product(conn, &input.product_id)?;
    validate_subject_key(&input.subject_key)?;
    validate_kind(&input.kind)?;
    validate_limits(input)?;
    if let Some(version) = &input.product_version {
        if !is_valid_version(version) {
            return Err(KbError::invalid(format!(
                "product_version '{version}' invalide; segments numériques séparés par des points attendus"
            )));
        }
    }

    let mut sanitized = input.clone();
    sanitized.title = redact_text(config, &input.title);
    sanitized.correction = redact_text(config, &input.correction);
    sanitized.symptom = input
        .symptom
        .as_ref()
        .map(|value| redact_text(config, value));
    sanitized.cause = input.cause.as_ref().map(|value| redact_text(config, value));
    sanitized.example = input
        .example
        .as_ref()
        .map(|value| redact_text(config, value));

    let identifiers = identifiers_from_inputs(&input.product_id, &sanitized.identifiers)?;
    let timestamp = now_iso();

    let tx = conn.transaction().map_err(KbError::Db)?;
    let incident_source = incident_source_if_any(&tx, input.incident_id, &input.product_id)?;
    let source = incident_source
        .clone()
        .unwrap_or_else(|| sanitized.source.clone());
    let existing = fetch_entry_by_subject(&tx, &input.product_id, &input.subject_key)?;

    let (entry_id, version, status) = match existing {
        None => {
            let current_id = 0;
            validate_depends(&tx, &input.product_id, &input.depends_on, current_id)?;
            check_identifier_conflicts(&tx, &input.product_id, &identifiers, current_id)?;
            let new_id = insert_entry(&tx, &input.product_id, &sanitized, &source, &timestamp)?;
            replace_terms(&tx, new_id, &sanitized.terms)?;
            replace_identifiers(&tx, new_id, &input.product_id, &identifiers)?;
            replace_depends_on(&tx, new_id, &input.depends_on)?;
            update_fts(&tx, new_id)?;

            // Auto-validation immédiate si prouvé par l'agent
            let final_status = if input.auto_validate.unwrap_or(false) {
                tx.execute(
                    "UPDATE entries SET status='valide', validated_by=?1, validated_at=?2, updated_at=?2 WHERE entry_id=?3",
                    params![format!("agent:auto_test:{}", ctx.actor), timestamp, new_id],
                ).map_err(KbError::Db)?;
                "valide".to_string()
            } else {
                "non_teste".to_string()
            };

            (new_id, 1, final_status)
        }
        Some(current) => {
            match current.status.as_str() {
                "valide" => {
                    return Err(KbError::ForbiddenStatus(
                        "l'entrée est valide; une proposition ne la dégrade jamais. \
                         Appelez kb_record_outcome avec 'ko' (et une note) ou kb_report_incident \
                         pour la passer à a_revoir, ou demandez une correction humaine (kb edit)."
                            .to_string(),
                    ))
                }
                "archive" => {
                    return Err(KbError::ForbiddenStatus(
                        "l'entrée est archivée; restaurez-la avec la commande humaine kb restore \
                         avant toute proposition"
                            .to_string(),
                    ))
                }
                _ => {}
            }
            let expected = input.expected_version.ok_or_else(|| {
                KbError::invalid(
                    "expected_version est obligatoire pour mettre à jour une entrée non_teste ou a_revoir",
                )
            })?;
            if expected != current.version {
                return Err(KbError::VersionConflict(format!(
                    "version attendue {expected}, version courante {} ; relisez l'entrée avec kb_get",
                    current.version
                )));
            }
            validate_depends(&tx, &input.product_id, &input.depends_on, current.entry_id)?;
            check_identifier_conflicts(&tx, &input.product_id, &identifiers, current.entry_id)?;

            let snapshot = snapshot_entry(&tx, &current)?;
            let snapshot_json = serde_json::to_string(&snapshot)?;
            tx.execute(
                "INSERT INTO entry_history (entry_id, version, snapshot, changed_by, reason, changed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    current.entry_id,
                    current.version,
                    snapshot_json,
                    ctx.actor,
                    "kb_propose",
                    timestamp
                ],
            )
            .map_err(KbError::Db)?;

            tx.execute(
                "UPDATE entries SET
                    kind = ?1, title = ?2, symptom = ?3, cause = ?4, correction = ?5,
                    example = ?6, status = 'non_teste', product_version = ?7, source = ?8,
                    validated_by = NULL, validated_at = NULL,
                    version = version + 1, updated_at = ?9
                 WHERE entry_id = ?10",
                params![
                    sanitized.kind,
                    sanitized.title,
                    sanitized.symptom,
                    sanitized.cause,
                    sanitized.correction,
                    sanitized.example,
                    sanitized.product_version,
                    source,
                    timestamp,
                    current.entry_id
                ],
            )
            .map_err(KbError::Db)?;

            if !sanitized.terms.is_empty() {
                replace_terms(&tx, current.entry_id, &sanitized.terms)?;
            }
            if !identifiers.is_empty() {
                replace_identifiers(&tx, current.entry_id, &input.product_id, &identifiers)?;
            }
            if !input.depends_on.is_empty() {
                replace_depends_on(&tx, current.entry_id, &input.depends_on)?;
            }
            update_fts(&tx, current.entry_id)?;
            (
                current.entry_id,
                current.version + 1,
                "non_teste".to_string(),
            )
        }
    };

    if let Some(incident_id) = input.incident_id {
        tx.execute(
            "UPDATE incidents SET state = 'traite', entry_id = ?1 WHERE incident_id = ?2",
            params![entry_id, incident_id],
        )
        .map_err(KbError::Db)?;
    }

    tx.commit().map_err(KbError::Db)?;

    let mut warnings = Vec::new();
    if !ctx.consulted {
        warnings.push("aucune_consultation".to_string());
    }

    Ok(ProposeResult {
        entry_id,
        version,
        status,
        warnings,
    })
}

pub fn get(conn: &Connection, input: &GetInput) -> KbResult<EntryFull> {
    let entry =
        match input.entry_id {
            Some(entry_id) => {
                if input.product_id.is_some() || input.subject_key.is_some() {
                    return Err(KbError::invalid(
                        "fournissez soit entry_id, soit product_id + subject_key, pas les deux",
                    ));
                }
                fetch_entry(conn, entry_id)?
                    .ok_or_else(|| KbError::NotFound(format!("l'entrée {entry_id} n'existe pas")))?
            }
            None => {
                let product_id = input.product_id.as_deref().ok_or_else(|| {
                    KbError::invalid("product_id est obligatoire avec subject_key")
                })?;
                let subject_key = input.subject_key.as_deref().ok_or_else(|| {
                    KbError::invalid("subject_key est obligatoire avec product_id")
                })?;
                fetch_entry_by_subject(conn, product_id, subject_key)?.ok_or_else(|| {
                    KbError::NotFound(format!("aucune entrée pour ({product_id}, {subject_key})"))
                })?
            }
        };

    let terms = fetch_terms(conn, entry.entry_id)?;
    let identifiers = fetch_identifiers(conn, entry.entry_id)?;
    let dependencies = if input.include_deps.unwrap_or(true) {
        let mut summaries = Vec::new();
        for dep_id in fetch_depends_on(conn, entry.entry_id)? {
            if let Some(dep) = fetch_entry(conn, dep_id)? {
                let excerpt = dep
                    .correction
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ");
                summaries.push(EntrySummary {
                    entry_id: dep.entry_id,
                    subject_key: dep.subject_key,
                    title: dep.title,
                    kind: dep.kind,
                    status: dep.status,
                    version: dep.version,
                    excerpt: truncate_chars(&excerpt, 220),
                    score: 0.0,
                });
            }
        }
        Some(summaries)
    } else {
        None
    };

    Ok(EntryFull {
        entry,
        terms,
        identifiers,
        dependencies,
    })
}
