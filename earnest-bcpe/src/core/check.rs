use rusqlite::{params, Connection, OptionalExtension};

use crate::config::AppConfig;
use crate::core::queries::{ensure_product, linked_entries};
use crate::error::{KbError, KbResult};
use crate::extractors::extract;
use crate::models::{CheckInput, CheckResponse, CheckVerdict, Occurrence, VerdictCounts};

struct Merged {
    identifier: String,
    occurrences: Vec<Occurrence>,
}

fn merge_extracted(items: Vec<crate::extractors::ExtractedIdentifier>) -> Vec<Merged> {
    let mut output: Vec<Merged> = Vec::new();
    let mut index_by_key: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
    for item in items {
        let key = item.identifier.to_lowercase();
        match index_by_key.get(&key) {
            Some(index) => output[*index].occurrences.push(item.occurrence),
            None => {
                index_by_key.insert(key, output.len());
                output.push(Merged {
                    identifier: item.identifier,
                    occurrences: vec![item.occurrence],
                });
            }
        }
    }
    output
}

fn merge_plain(identifiers: &[String]) -> KbResult<Vec<Merged>> {
    let mut output: Vec<Merged> = Vec::new();
    let mut index_by_key: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
    for raw in identifiers {
        let identifier = raw.trim();
        if identifier.is_empty() {
            return Err(KbError::invalid("identifiers[] contient une valeur vide"));
        }
        let key = identifier.to_lowercase();
        match index_by_key.get(&key) {
            Some(_) => {}
            None => {
                index_by_key.insert(key, output.len());
                output.push(Merged {
                    identifier: identifier.to_string(),
                    occurrences: Vec::new(),
                });
            }
        }
    }
    Ok(output)
}

fn lex_contains(conn: &Connection, product_id: &str, identifier: &str) -> KbResult<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM lexicon_identifiers WHERE product_id = ?1 AND identifier = ?2",
            params![product_id, identifier],
            |row| row.get(0),
        )
        .optional()
        .map_err(KbError::Db)?;
    Ok(found.is_some())
}

pub fn check(conn: &Connection, config: &AppConfig, input: &CheckInput) -> KbResult<CheckResponse> {
    ensure_product(conn, &input.product_id)?;

    let merged = match (&input.script_text, input.identifiers.is_empty()) {
        (Some(script), true) => {
            let kind = input
                .script_kind
                .as_deref()
                .ok_or_else(|| KbError::invalid("script_kind est obligatoire avec script_text"))?;
            if script.trim().is_empty() {
                return Err(KbError::invalid("script_text ne peut pas être vide"));
            }
            merge_extracted(extract(config, kind, script)?)
        }
        (Some(_), false) => {
            return Err(KbError::invalid(
                "fournissez soit identifiers[], soit script_text + script_kind, pas les deux",
            ))
        }
        (None, false) => merge_plain(&input.identifiers)?,
        (None, true) => {
            return Err(KbError::invalid(
                "fournissez identifiers[] ou script_text + script_kind",
            ))
        }
    };

    let lexicon_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM lexicon_identifiers WHERE product_id = ?1",
            params![input.product_id],
            |row| row.get(0),
        )
        .map_err(KbError::Db)?;
    let has_lexicon = lexicon_count > 0;

    let mut summary = VerdictCounts::default();
    let mut verdicts = Vec::new();

    for item in merged {
        let linked = linked_entries(conn, &input.product_id, &item.identifier)?;
        let valid_row = linked.iter().find(|row| row.status == "valide");

        let (verdict, replaced_by, hors_lexique) = if let Some(valid) = valid_row {
            let verdict = if valid.state == "valide" {
                "ok".to_string()
            } else {
                valid.state.clone()
            };
            (verdict, valid.replaced_by.clone(), None)
        } else if lex_contains(conn, &input.product_id, &item.identifier)? {
            ("ok".to_string(), None, None)
        } else {
            (
                "inconnu".to_string(),
                None,
                if has_lexicon { Some(true) } else { None },
            )
        };

        match verdict.as_str() {
            "ok" => summary.ok += 1,
            "deprecie" => summary.deprecie += 1,
            "inexistant" => summary.inexistant += 1,
            _ => summary.inconnu += 1,
        }

        let include_correction = verdict == "deprecie" || verdict == "inexistant";
        let entries_liees = linked
            .into_iter()
            .map(|mut row| {
                if !(include_correction && row.status == "valide") {
                    row.correction = None;
                }
                row
            })
            .collect::<Vec<_>>();

        verdicts.push(CheckVerdict {
            identifier: item.identifier,
            verdict,
            replaced_by,
            hors_lexique,
            entries_liees,
            occurrences: item.occurrences,
        });
    }

    Ok(CheckResponse { summary, verdicts })
}
