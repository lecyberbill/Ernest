mod common;

use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use rusqlite::params;
use serde_json::json;

use common::*;
use kb::core::incidents::report_incident;
use kb::core::lifecycle::{backup, lint, product_version, reindex};
use kb::mcp::{tool_definitions, McpServer};
use kb::models::{CheckInput, IdentifierInput, IncidentInput, OutcomeInput};

#[test]
fn a01_propose_twice_same_subject() {
    let mut kb = TestKb::new();
    let first = kb
        .propose(&propose_input("produit-test", "double"), true)
        .unwrap();
    assert_eq!(first.version, 1);
    let mut second_input = propose_input("produit-test", "double");
    second_input.expected_version = Some(1);
    let second = kb.propose(&second_input, true).unwrap();
    assert_eq!(second.version, 2);

    let entries: i64 = kb
        .conn
        .query_row(
            "SELECT COUNT(*) FROM entries WHERE product_id='produit-test' AND subject_key='double'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(entries, 1);
    let history: i64 = kb
        .conn
        .query_row(
            "SELECT COUNT(*) FROM entry_history WHERE entry_id=?1",
            params![first.entry_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(history, 1);
}

#[test]
fn a02_stale_expected_version() {
    let mut kb = TestKb::new();
    let first = kb
        .propose(&propose_input("produit-test", "stale"), true)
        .unwrap();
    let mut input = propose_input("produit-test", "stale");
    input.expected_version = Some(99);
    input.correction = "nouvelle correction".to_string();
    let error = kb.propose(&input, true).unwrap_err();
    assert_eq!(error.code(), "version_conflict");

    let version: i64 = kb
        .conn
        .query_row(
            "SELECT version FROM entries WHERE entry_id=?1",
            params![first.entry_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(version, 1);
    let correction: String = kb
        .conn
        .query_row(
            "SELECT correction FROM entries WHERE entry_id=?1",
            params![first.entry_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_ne!(correction, "nouvelle correction");
}

#[test]
fn a03_status_field_is_rejected() {
    let kb = TestKb::new();
    let mut server = McpServer::new(kb.open_second(), kb.config.clone());
    let response = mcp_call(
        &mut server,
        "kb_propose",
        json!({
            "product_id": "produit-test",
            "subject_key": "avec-statut",
            "kind": "piege",
            "title": "titre",
            "correction": "correction",
            "source": "agent",
            "status": "valide"
        }),
    );
    assert_eq!(error_code(&response), Some("invalid_argument"));
    let count: i64 = kb
        .conn
        .query_row(
            "SELECT COUNT(*) FROM entries WHERE subject_key='avec-statut'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn a04_no_human_tool_exposed() {
    let tools = tool_definitions();
    let names: Vec<String> = tools
        .iter()
        .filter_map(|tool| tool.get("name").and_then(|name| name.as_str()))
        .map(|name| name.to_string())
        .collect();
    assert_eq!(names.len(), 6);
    for name in &names {
        assert!(!name.contains("validate"));
        assert!(!name.contains("archive"));
        assert!(!name.contains("delete"));
        assert!(!name.contains("restore"));
        assert!(!name.contains("edit"));
    }
    for expected in [
        "kb_search",
        "kb_get",
        "kb_check",
        "kb_report_incident",
        "kb_propose",
        "kb_record_outcome",
    ] {
        assert!(names.contains(&expected.to_string()));
    }
}

#[test]
fn a05_valid_status_requires_validator() {
    let mut kb = TestKb::new();
    let created = kb
        .propose(&propose_input("produit-test", "sans-valideur"), true)
        .unwrap();
    let result = kb.conn.execute(
        "UPDATE entries SET status='valide' WHERE entry_id=?1",
        params![created.entry_id],
    );
    assert!(result.is_err());
    let status: String = kb
        .conn
        .query_row(
            "SELECT status FROM entries WHERE entry_id=?1",
            params![created.entry_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(status, "non_teste");
}

#[test]
fn a06_search_covered_and_not_covered() {
    let kb = TestKb::new();
    let found = kb.search(&search_input("produit-test", "pause")).unwrap();
    assert_eq!(found.results.len(), 1);
    assert_eq!(found.results[0].subject_key, "attente-pause");
    assert!(found.covered);

    let missing = kb.search(&search_input("produit-test", "xyzzy")).unwrap();
    assert!(missing.results.is_empty());
    assert!(!missing.covered);
    assert!(missing
        .message
        .as_deref()
        .unwrap()
        .contains("non couvert ou non validé"));
}

#[test]
fn a07_status_ranking_excludes_archive() {
    let kb = TestKb::new();
    kb.add_product("p7", "1.0");
    kb.insert_entry(
        "p7",
        "valide",
        "piege",
        "Sujet commun",
        "correction commune",
        "valide",
        Some("test"),
        None,
        &["commun"],
        &[],
    );
    kb.insert_entry(
        "p7",
        "non-teste",
        "piege",
        "Sujet commun",
        "correction commune",
        "non_teste",
        None,
        None,
        &["commun"],
        &[],
    );
    kb.insert_entry(
        "p7",
        "archive",
        "piege",
        "Sujet commun",
        "correction commune",
        "archive",
        None,
        None,
        &["commun"],
        &[],
    );
    let response = kb.search(&search_input("p7", "commun")).unwrap();
    assert!(response.covered);
    assert_eq!(response.results[0].status, "valide");
    assert!(response.results.iter().all(|item| item.status != "archive"));
}

#[test]
fn a08_verdicts_for_script_identifiers() {
    let mut kb = TestKb::new();
    let mut input = propose_input("produit-test", "non-teste-ident");
    input.identifiers = vec![IdentifierInput {
        identifier: "TAG_NON_TESTE".to_string(),
        state: "valide".to_string(),
        replaced_by: None,
    }];
    kb.propose(&input, true).unwrap();

    let response = kb
        .check(&CheckInput {
            product_id: "produit-test".to_string(),
            identifiers: vec![
                "TAG_PAUSE".to_string(),
                "PARAM_ANCIEN".to_string(),
                "TAG_INCONNU".to_string(),
                "TAG_NON_TESTE".to_string(),
            ],
            script_text: None,
            script_kind: None,
        })
        .unwrap();

    let by_identifier: BTreeMap<String, String> = response
        .verdicts
        .iter()
        .map(|verdict| (verdict.identifier.clone(), verdict.verdict.clone()))
        .collect();
    assert_eq!(
        by_identifier.get("TAG_PAUSE").map(String::as_str),
        Some("inexistant")
    );
    assert_eq!(
        by_identifier.get("PARAM_ANCIEN").map(String::as_str),
        Some("deprecie")
    );
    assert_eq!(
        by_identifier.get("TAG_INCONNU").map(String::as_str),
        Some("inconnu")
    );
    assert_eq!(
        by_identifier.get("TAG_NON_TESTE").map(String::as_str),
        Some("inconnu")
    );
    assert!(response
        .verdicts
        .iter()
        .all(|verdict| verdict.verdict != "ok"));

    let pause = response
        .verdicts
        .iter()
        .find(|verdict| verdict.identifier == "TAG_PAUSE")
        .unwrap();
    assert_eq!(pause.replaced_by.as_deref(), Some("TAG_ATTENTE"));
    assert!(pause
        .entries_liees
        .iter()
        .any(|entry| entry.subject_key == "attente-pause"));
}

#[test]
fn a09_unknown_outside_lexicon() {
    let kb = TestKb::new();
    let response = kb
        .check(&CheckInput {
            product_id: "produit-test".to_string(),
            identifiers: vec!["TAG_ABSENT".to_string()],
            script_text: None,
            script_kind: None,
        })
        .unwrap();
    let verdict = &response.verdicts[0];
    assert_eq!(verdict.verdict, "inconnu");
    assert_eq!(verdict.hors_lexique, Some(true));
}

#[test]
fn a10_product_version_expiration() {
    let mut kb = TestKb::new();
    let attente: i64 = kb
        .conn
        .query_row(
            "SELECT entry_id FROM entries WHERE subject_key='attente-pause'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let ancien: i64 = kb
        .conn
        .query_row(
            "SELECT entry_id FROM entries WHERE subject_key='ancien-param'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    let updated = product_version(&mut kb.conn, "produit-test", "2.0.0").unwrap();
    assert!(updated.contains(&ancien));
    assert!(!updated.contains(&attente));
    let attente_status: String = kb
        .conn
        .query_row(
            "SELECT status FROM entries WHERE entry_id=?1",
            params![attente],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(attente_status, "valide");

    let sans_version = kb.insert_entry(
        "produit-test",
        "sans-version",
        "regle",
        "Sans version",
        "correction",
        "valide",
        Some("test"),
        None,
        &["sans"],
        &[],
    );

    let updated = product_version(&mut kb.conn, "produit-test", "2.1").unwrap();
    assert!(updated.contains(&attente));
    let sans_status: String = kb
        .conn
        .query_row(
            "SELECT status FROM entries WHERE entry_id=?1",
            params![sans_version],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(sans_status, "valide");

    let error = product_version(&mut kb.conn, "produit-test", "2.x").unwrap_err();
    assert_eq!(error.code(), "invalid_argument");
}

#[test]
fn a11_record_outcome_transitions_and_note() {
    let mut kb = TestKb::new();
    let attente: i64 = kb
        .conn
        .query_row(
            "SELECT entry_id FROM entries WHERE subject_key='attente-pause'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let result = kb
        .record_outcome(&OutcomeInput {
            entry_id: attente,
            outcome: "ko".to_string(),
            note: Some("la balise ne fonctionne plus".to_string()),
        })
        .unwrap();
    assert_eq!(result.status, "a_revoir");
    assert_eq!(result.fail_count, 1);
    assert_eq!(result.version, 1);

    let created = kb
        .propose(&propose_input("produit-test", "non-teste-outcome"), true)
        .unwrap();
    let result = kb
        .record_outcome(&OutcomeInput {
            entry_id: created.entry_id,
            outcome: "ko".to_string(),
            note: Some("échec en usage".to_string()),
        })
        .unwrap();
    assert_eq!(result.status, "non_teste");
    assert_eq!(result.fail_count, 1);

    let error = kb
        .record_outcome(&OutcomeInput {
            entry_id: created.entry_id,
            outcome: "ko".to_string(),
            note: None,
        })
        .unwrap_err();
    assert_eq!(error.code(), "invalid_argument");
}

#[test]
fn a12_incident_links_entry() {
    let mut kb = TestKb::new();
    let incident = report_incident(
        &mut kb.conn,
        &kb.config,
        &IncidentInput {
            product_id: "produit-test".to_string(),
            expected: "12 fichiers publiés".to_string(),
            observed: "11 fichiers publiés".to_string(),
            script_ref: Some("publier.aml".to_string()),
            log_excerpt: Some("WARN|publication|ecart|attendu=12|observe=11".to_string()),
        },
        "agent:test",
    )
    .unwrap();
    assert!(incident.incident_id > 0);

    let mut input = propose_input("produit-test", "incident-entry");
    input.incident_id = Some(incident.incident_id);
    let created = kb.propose(&input, true).unwrap();
    let state: (String, Option<i64>) = kb
        .conn
        .query_row(
            "SELECT state, entry_id FROM incidents WHERE incident_id=?1",
            params![incident.incident_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(state.0, "traite");
    assert_eq!(state.1, Some(created.entry_id));

    let second = report_incident(
        &mut kb.conn,
        &kb.config,
        &IncidentInput {
            product_id: "produit-test".to_string(),
            expected: "sortie".to_string(),
            observed: "rien".to_string(),
            script_ref: None,
            log_excerpt: None,
        },
        "agent:test",
    )
    .unwrap();
    let existing = kb
        .propose(&propose_input("produit-test", "incident-existing"), true)
        .unwrap();
    let mut update = propose_input("produit-test", "incident-existing");
    update.expected_version = Some(existing.version);
    update.incident_id = Some(second.incident_id);
    let updated = kb.propose(&update, true).unwrap();
    assert_eq!(updated.entry_id, existing.entry_id);
    let linked: Option<i64> = kb
        .conn
        .query_row(
            "SELECT entry_id FROM incidents WHERE incident_id=?1",
            params![second.incident_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(linked, Some(existing.entry_id));
}

#[test]
fn a13_redaction_of_free_text() {
    let mut kb = TestKb::new();

    report_incident(
        &mut kb.conn,
        &kb.config,
        &IncidentInput {
            product_id: "produit-test".to_string(),
            expected: "ok".to_string(),
            observed: "password=abc123".to_string(),
            script_ref: None,
            log_excerpt: Some("ERROR|auth|password=abc123".to_string()),
        },
        "agent:test",
    )
    .unwrap();

    let mut input = propose_input("produit-test", "redaction");
    input.correction = "éviter password=abc123".to_string();
    input.example = Some("example password=abc123".to_string());
    let created = kb.propose(&input, true).unwrap();

    let attente: i64 = kb
        .conn
        .query_row(
            "SELECT entry_id FROM entries WHERE subject_key='attente-pause'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    kb.record_outcome(&OutcomeInput {
        entry_id: attente,
        outcome: "ko".to_string(),
        note: Some("motif password=abc123".to_string()),
    })
    .unwrap();

    let log_excerpt: String = kb
        .conn
        .query_row(
            "SELECT log_excerpt FROM incidents ORDER BY incident_id LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!log_excerpt.contains("abc123"));
    assert!(log_excerpt.contains("REDACTED"));

    let (correction, example): (String, String) = kb
        .conn
        .query_row(
            "SELECT correction, example FROM entries WHERE entry_id=?1",
            params![created.entry_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert!(!correction.contains("abc123"));
    assert!(!example.contains("abc123"));

    let note: String = kb
        .conn
        .query_row(
            "SELECT note FROM entry_outcomes ORDER BY outcome_id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!note.contains("abc123"));
    assert!(note.contains("REDACTED"));
}

#[test]
fn a14_performance_budget() {
    let mut kb = TestKb::empty();
    kb.add_product("perf", "1.0");
    let now = kb::core::time::now_iso();
    {
        let tx = kb.conn.transaction().unwrap();
        for index in 0..10_000 {
            tx.execute(
                "INSERT INTO entries
                 (product_id, subject_key, kind, title, correction, status, source,
                  use_count, fail_count, version, created_at, updated_at)
                 VALUES ('perf', ?1, 'piege', ?2, ?3, 'non_teste', 'agent', 0, 0, 1, ?4, ?4)",
                params![
                    format!("sujet-{index}"),
                    format!("Erreur commune {index}"),
                    format!("Correction nombre {index}"),
                    now
                ],
            )
            .unwrap();
            let entry_id = tx.last_insert_rowid();
            tx.execute(
                "INSERT INTO entry_terms (entry_id, term) VALUES (?1, 'erreur')",
                params![entry_id],
            )
            .unwrap();
            tx.execute(
                "INSERT INTO entries_fts (rowid, title, symptom, cause, correction, terms)
                 VALUES (?1, ?2, '', '', ?3, 'erreur')",
                params![
                    entry_id,
                    format!("Erreur commune {index}"),
                    format!("Correction nombre {index}")
                ],
            )
            .unwrap();
        }
        tx.commit().unwrap();
    }

    let mut durations = Vec::with_capacity(1000);
    for _ in 0..1000 {
        let started = Instant::now();
        let response = kb.search(&search_input("perf", "erreur")).unwrap();
        durations.push(started.elapsed());
        assert_eq!(response.results.len(), 5);
    }
    durations.sort();
    let p95 = durations[950];
    assert!(
        p95 < Duration::from_millis(100),
        "recherche p95 trop lente: {p95:?}"
    );

    let mut script = String::new();
    for index in 0..2_000 {
        script.push_str(&format!("PARAM_{index:04};\n"));
    }
    let started = Instant::now();
    let response = kb
        .check(&CheckInput {
            product_id: "perf".to_string(),
            identifiers: Vec::new(),
            script_text: Some(script),
            script_kind: Some("test".to_string()),
        })
        .unwrap();
    let elapsed = started.elapsed();
    assert_eq!(response.verdicts.len(), 2_000);
    assert!(
        elapsed < Duration::from_secs(1),
        "kb_check trop lent: {elapsed:?}"
    );
}

#[test]
fn a15_backup_restore_integrity() {
    let TestKb {
        dir,
        db_path,
        conn,
        config: _,
    } = TestKb::new();
    let backup_path = backup(&conn, dir.path()).unwrap();
    drop(conn);

    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(db_path.with_extension("db-wal"));
    let _ = std::fs::remove_file(db_path.with_extension("db-shm"));
    std::fs::copy(&backup_path, &db_path).unwrap();

    let restored = kb::db::open(&db_path).unwrap();
    kb::db::init(&restored).unwrap();
    let integrity: String = restored
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    assert!(lint(&restored, None).is_ok());
}

#[test]
fn a16_reindex_restores_search() {
    let mut kb = TestKb::new();
    let before = kb.search(&search_input("produit-test", "pause")).unwrap();
    assert_eq!(before.results.len(), 1);

    kb.conn.execute("DELETE FROM entries_fts", []).unwrap();
    let count = reindex(&mut kb.conn).unwrap();
    assert!(count >= 2);

    let after = kb.search(&search_input("produit-test", "pause")).unwrap();
    assert_eq!(after.results[0].entry_id, before.results[0].entry_id);
    let missing = kb.search(&search_input("produit-test", "xyzzy")).unwrap();
    assert!(missing.results.is_empty());
    assert!(!missing.covered);
}

#[test]
fn a17_propose_forbidden_on_valid_and_archive() {
    let mut kb = TestKb::new();
    let attente: i64 = kb
        .conn
        .query_row(
            "SELECT entry_id FROM entries WHERE subject_key='attente-pause'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    let mut valid_input = propose_input("produit-test", "attente-pause");
    valid_input.expected_version = Some(1);
    let error = kb.propose(&valid_input, true).unwrap_err();
    assert_eq!(error.code(), "forbidden_status");

    let archived = kb.insert_entry(
        "produit-test",
        "archivee",
        "piege",
        "Archivee",
        "correction",
        "archive",
        None,
        None,
        &["archivee"],
        &[],
    );
    let mut archive_input = propose_input("produit-test", "archivee");
    archive_input.expected_version = Some(1);
    let error = kb.propose(&archive_input, true).unwrap_err();
    assert_eq!(error.code(), "forbidden_status");

    let version: i64 = kb
        .conn
        .query_row(
            "SELECT version FROM entries WHERE entry_id=?1",
            params![attente],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(version, 1);
    let check = kb
        .check(&CheckInput {
            product_id: "produit-test".to_string(),
            identifiers: vec!["TAG_ATTENTE".to_string()],
            script_text: None,
            script_kind: None,
        })
        .unwrap();
    assert_eq!(check.verdicts[0].verdict, "ok");
    let archived_status: String = kb
        .conn
        .query_row(
            "SELECT status FROM entries WHERE entry_id=?1",
            params![archived],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(archived_status, "archive");
}

#[test]
fn a18_identifier_conflicts() {
    let mut kb = TestKb::new();
    let mut lexicon_entry = propose_input("produit-test", "lexique-piege");
    lexicon_entry.identifiers = vec![IdentifierInput {
        identifier: "TAG_ATTENTE".to_string(),
        state: "valide".to_string(),
        replaced_by: None,
    }];
    let created = kb.propose(&lexicon_entry, true).unwrap();

    let check = kb
        .check(&CheckInput {
            product_id: "produit-test".to_string(),
            identifiers: vec!["TAG_ATTENTE".to_string()],
            script_text: None,
            script_kind: None,
        })
        .unwrap();
    assert_eq!(check.verdicts[0].verdict, "ok");
    assert!(check.verdicts[0]
        .entries_liees
        .iter()
        .any(|entry| entry.entry_id == created.entry_id));

    let first = kb.insert_entry(
        "produit-test",
        "commun-1",
        "piege",
        "Commun 1",
        "correction",
        "valide",
        Some("test"),
        None,
        &["commun"],
        &[("TAG_COMMUN", "valide", None)],
    );
    let second = kb.insert_entry(
        "produit-test",
        "commun-2",
        "piege",
        "Commun 2",
        "correction",
        "valide",
        Some("test"),
        None,
        &["commun"],
        &[("TAG_COMMUN", "valide", None)],
    );
    let check = kb
        .check(&CheckInput {
            product_id: "produit-test".to_string(),
            identifiers: vec!["TAG_COMMUN".to_string()],
            script_text: None,
            script_kind: None,
        })
        .unwrap();
    assert_eq!(check.verdicts[0].verdict, "ok");
    let linked: Vec<i64> = check.verdicts[0]
        .entries_liees
        .iter()
        .map(|entry| entry.entry_id)
        .collect();
    assert!(linked.contains(&first));
    assert!(linked.contains(&second));

    let mut conflict = propose_input("produit-test", "commun-3");
    conflict.identifiers = vec![IdentifierInput {
        identifier: "TAG_COMMUN".to_string(),
        state: "deprecie".to_string(),
        replaced_by: Some("TAG_NOUVEAU".to_string()),
    }];
    let error = kb.propose(&conflict, true).unwrap_err();
    assert_eq!(error.code(), "invalid_argument");

    let check = kb
        .check(&CheckInput {
            product_id: "produit-test".to_string(),
            identifiers: vec!["TAG_COMMUN".to_string()],
            script_text: None,
            script_kind: None,
        })
        .unwrap();
    assert_eq!(check.verdicts[0].verdict, "ok");
}

#[test]
fn a19_extractor_ignores_local_names() {
    let kb = TestKb::new();
    let script = "let temp = 1;\nTAG_ATTENTE(temp);\nPARAM_NOUVEAU = temp;\n";
    let response = kb
        .check(&CheckInput {
            product_id: "produit-test".to_string(),
            identifiers: Vec::new(),
            script_text: Some(script.to_string()),
            script_kind: Some("test".to_string()),
        })
        .unwrap();
    let identifiers: Vec<&str> = response
        .verdicts
        .iter()
        .map(|verdict| verdict.identifier.as_str())
        .collect();
    assert!(identifiers.contains(&"TAG_ATTENTE"));
    assert!(identifiers.contains(&"PARAM_NOUVEAU"));
    assert!(!identifiers.contains(&"temp"));
}

#[test]
fn a20_concurrent_outcomes_are_atomic() {
    let kb = TestKb::new();
    let attente: i64 = kb
        .conn
        .query_row(
            "SELECT entry_id FROM entries WHERE subject_key='attente-pause'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let db_path = kb.db_path.clone();
    let config = kb.config.clone();

    std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for index in 0..2 {
            let db_path = db_path.clone();
            let config = config.clone();
            handles.push(scope.spawn(move || {
                let mut conn = kb::db::open(&db_path).unwrap();
                kb::core::lifecycle::record_outcome(
                    &mut conn,
                    &config,
                    &OutcomeInput {
                        entry_id: attente,
                        outcome: "ko".to_string(),
                        note: Some(format!("échec concurrent {index}")),
                    },
                    "agent:test",
                )
            }));
        }
        for handle in handles {
            let result = handle.join().unwrap();
            assert!(result.is_ok(), "écriture concurrente en échec: {result:?}");
        }
    });

    let (fail_count, status): (i64, String) = kb
        .conn
        .query_row(
            "SELECT fail_count, status FROM entries WHERE entry_id=?1",
            params![attente],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(fail_count, 2);
    assert_eq!(status, "a_revoir");
}

#[test]
fn a21_invalid_dependencies_rejected() {
    let mut kb = TestKb::new();
    kb.add_product("autre", "1.0");
    let archived = kb.insert_entry(
        "produit-test",
        "dep-archivee",
        "piege",
        "Archivee",
        "correction",
        "archive",
        None,
        None,
        &["dep"],
        &[],
    );
    let other = kb.insert_entry(
        "autre",
        "dep-autre",
        "piege",
        "Autre",
        "correction",
        "non_teste",
        None,
        None,
        &["dep"],
        &[],
    );

    for (dep, subject) in [(archived, "dep-1"), (other, "dep-2"), (999_999, "dep-3")] {
        let mut input = propose_input("produit-test", subject);
        input.depends_on = vec![dep];
        let error = kb.propose(&input, true).unwrap_err();
        assert_eq!(error.code(), "invalid_argument");
        let count: i64 = kb
            .conn
            .query_row(
                "SELECT COUNT(*) FROM entries WHERE subject_key=?1",
                params![subject],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }
}

#[test]
fn a22_covered_more_available_and_offset() {
    let kb = TestKb::new();
    kb.add_product("p22", "1.0");
    for index in 0..7 {
        kb.insert_entry(
            "p22",
            &format!("sujet-{index}"),
            "piege",
            "Beaucoup de correspondances",
            "correction beaucoup",
            "non_teste",
            None,
            None,
            &["beaucoup"],
            &[],
        );
    }
    let mut input = search_input("p22", "beaucoup");
    let response = kb.search(&input).unwrap();
    assert!(!response.covered);
    assert!(response.more_available);
    assert_eq!(response.results.len(), 5);

    kb.insert_entry(
        "p22",
        "valide-1",
        "piege",
        "Beaucoup valide",
        "correction beaucoup",
        "valide",
        Some("test"),
        None,
        &["beaucoup"],
        &[],
    );
    let response = kb.search(&input).unwrap();
    assert!(response.covered);
    assert_eq!(response.results.len(), 5);
    assert!(response.more_available);

    input.offset = Some(5);
    let response = kb.search(&input).unwrap();
    assert_eq!(response.results.len(), 3);
    assert!(!response.more_available);
}

#[test]
fn a23_lint_reports_cases() {
    let mut kb = TestKb::new();
    kb.insert_entry(
        "produit-test",
        "valide-absent",
        "piege",
        "Valide absent",
        "correction",
        "valide",
        Some("test"),
        None,
        &["absent"],
        &[("VALIDE_ABSENT", "valide", None)],
    );

    let created = kb
        .propose(&propose_input("produit-test", "echecs"), true)
        .unwrap();
    kb.record_outcome(&OutcomeInput {
        entry_id: created.entry_id,
        outcome: "ko".to_string(),
        note: Some("échec".to_string()),
    })
    .unwrap();

    kb.add_lexicon("produit-test", &["DEPRECIE_IN_LEX"]);
    kb.insert_entry(
        "produit-test",
        "deprecie-lexique",
        "piege",
        "Deprecie lexique",
        "correction",
        "non_teste",
        None,
        None,
        &["deprecie"],
        &[("DEPRECIE_IN_LEX", "deprecie", Some("AUTRE"))],
    );

    let findings = lint(&kb.conn, Some("produit-test")).unwrap();
    let categories: Vec<&str> = findings.iter().map(|finding| finding.category).collect();
    assert!(categories.contains(&"valide_absent_du_lexique"));
    assert!(categories.contains(&"non_teste_avec_echecs"));
    assert!(categories.contains(&"identifiant_signale_dans_lexique"));
}

#[test]
fn a24_no_consultation_warning() {
    let kb = TestKb::new();
    let mut server = McpServer::new(kb.open_second(), kb.config.clone());

    let first = mcp_call(
        &mut server,
        "kb_propose",
        json!({
            "product_id": "produit-test",
            "subject_key": "sans-consultation",
            "kind": "piege",
            "title": "Sans consultation",
            "correction": "Correction",
            "source": "agent"
        }),
    );
    let warnings = first
        .get("warnings")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    assert!(warnings
        .iter()
        .any(|warning| warning == "aucune_consultation"));

    let search = mcp_call(
        &mut server,
        "kb_search",
        json!({"product_id": "produit-test", "query": "pause"}),
    );
    assert!(search.get("results").is_some());

    let second = mcp_call(
        &mut server,
        "kb_propose",
        json!({
            "product_id": "produit-test",
            "subject_key": "apres-consultation",
            "kind": "piege",
            "title": "Apres consultation",
            "correction": "Correction",
            "source": "agent"
        }),
    );
    let warnings = second
        .get("warnings")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    assert!(warnings.is_empty());
}

#[test]
fn a25_get_entry_by_subject_and_deps() {
    let mut kb = TestKb::new();
    let main = kb
        .propose(&propose_input("produit-test", "main-entry"), true)
        .unwrap();
    let dependency = kb
        .propose(&propose_input("produit-test", "dep-entry"), true)
        .unwrap();
    let mut update = propose_input("produit-test", "main-entry");
    update.expected_version = Some(main.version);
    update.depends_on = vec![dependency.entry_id];
    kb.propose(&update, true).unwrap();

    let response = kb
        .get(&kb::models::GetInput {
            product_id: Some("produit-test".to_string()),
            subject_key: Some("main-entry".to_string()),
            entry_id: None,
            include_deps: None,
        })
        .unwrap();
    assert_eq!(response.entry.entry_id, main.entry_id);
    let deps = response.dependencies.unwrap();
    assert_eq!(deps.len(), 1);
    assert_eq!(deps[0].entry_id, dependency.entry_id);
}
