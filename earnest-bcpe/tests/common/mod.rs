use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use kb::config::AppConfig;
use kb::core::entries::{propose, ProposeContext};
use kb::core::lifecycle::record_outcome;
use kb::core::queries::{replace_identifiers, replace_terms, update_fts};
use kb::core::time::now_iso;
use kb::db;
use kb::mcp::McpServer;
use kb::models::{
    CheckInput, IdentifierRow, OutcomeInput, ProposeInput, ProposeResult, SearchInput,
    SearchResponse,
};

pub struct TestKb {
    pub dir: tempfile::TempDir,
    pub db_path: PathBuf,
    pub conn: Connection,
    pub config: AppConfig,
}

impl TestKb {
    pub fn empty() -> Self {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("kb.db");
        let conn = db::open(&db_path).expect("open db");
        db::init(&conn).expect("init db");
        let config_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("config");
        let config = AppConfig::load(Some(&config_path)).expect("config");
        TestKb {
            dir,
            db_path,
            conn,
            config,
        }
    }

    pub fn new() -> Self {
        let kb = Self::empty();
        kb.seed();
        kb
    }

    pub fn add_product(&self, product_id: &str, version: &str) {
        self.conn
            .execute(
                "INSERT INTO products (product_id, name, current_version) VALUES (?1, ?2, ?3)",
                params![product_id, product_id, version],
            )
            .expect("product");
    }

    pub fn add_lexicon(&self, product_id: &str, identifiers: &[&str]) {
        for identifier in identifiers {
            self.conn
                .execute(
                    "INSERT OR IGNORE INTO lexicon_identifiers (product_id, identifier)
                     VALUES (?1, ?2)",
                    params![product_id, identifier],
                )
                .expect("lexicon");
        }
    }

    pub fn seed(&self) {
        self.add_product("produit-test", "2.0");
        self.add_lexicon(
            "produit-test",
            &["TAG_ATTENTE", "TAG_SORTIE", "PARAM_NOUVEAU"],
        );

        self.insert_entry(
            "produit-test",
            "attente-pause",
            "piege",
            "Instruction d'attente",
            "Utiliser TAG_ATTENTE avec le paramètre DUREE (secondes).",
            "valide",
            Some("test"),
            Some("2.0"),
            &["attendre", "pause", "wait", "delay"],
            &[
                ("TAG_ATTENTE", "valide", None),
                ("TAG_PAUSE", "inexistant", Some("TAG_ATTENTE")),
            ],
        );

        self.insert_entry(
            "produit-test",
            "ancien-param",
            "regle",
            "Paramètre remplacé",
            "PARAM_ANCIEN est remplacé par PARAM_NOUVEAU.",
            "valide",
            Some("test"),
            Some("1.0"),
            &[],
            &[("PARAM_ANCIEN", "deprecie", Some("PARAM_NOUVEAU"))],
        );
    }

    #[allow(clippy::too_many_arguments)]
    pub fn insert_entry(
        &self,
        product_id: &str,
        subject_key: &str,
        kind: &str,
        title: &str,
        correction: &str,
        status: &str,
        validated_by: Option<&str>,
        product_version: Option<&str>,
        terms: &[&str],
        identifiers: &[(&str, &str, Option<&str>)],
    ) -> i64 {
        let now = now_iso();
        let validated_at = if status == "valide" {
            Some(now.clone())
        } else {
            None
        };
        self.conn
            .execute(
                "INSERT INTO entries
                 (product_id, subject_key, kind, title, correction, status, product_version,
                  source, validated_by, validated_at, use_count, fail_count, version,
                  created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'humain:test', ?8, ?9, 0, 0, 1, ?10, ?10)",
                params![
                    product_id,
                    subject_key,
                    kind,
                    title,
                    correction,
                    status,
                    product_version,
                    validated_by,
                    validated_at,
                    now
                ],
            )
            .expect("entry");
        let entry_id = self.conn.last_insert_rowid();
        let term_strings: Vec<String> = terms.iter().map(|term| term.to_string()).collect();
        replace_terms(&self.conn, entry_id, &term_strings).expect("terms");
        let rows: Vec<IdentifierRow> = identifiers
            .iter()
            .map(|(identifier, state, replaced_by)| IdentifierRow {
                entry_id,
                product_id: product_id.to_string(),
                identifier: identifier.to_string(),
                state: state.to_string(),
                replaced_by: replaced_by.map(|value| value.to_string()),
            })
            .collect();
        replace_identifiers(&self.conn, entry_id, product_id, &rows).expect("identifiers");
        update_fts(&self.conn, entry_id).expect("fts");
        entry_id
    }

    pub fn propose(
        &mut self,
        input: &ProposeInput,
        consulted: bool,
    ) -> kb::KbResult<ProposeResult> {
        propose(
            &mut self.conn,
            &self.config,
            input,
            &ProposeContext {
                consulted,
                actor: "agent:test".to_string(),
            },
        )
    }

    pub fn search(&self, input: &SearchInput) -> kb::KbResult<SearchResponse> {
        kb::core::search::search(&self.conn, input)
    }

    pub fn get(&self, input: &kb::models::GetInput) -> kb::KbResult<kb::models::EntryFull> {
        kb::core::entries::get(&self.conn, input)
    }

    pub fn check(&self, input: &CheckInput) -> kb::KbResult<kb::models::CheckResponse> {
        kb::core::check::check(&self.conn, &self.config, input)
    }

    pub fn record_outcome(
        &mut self,
        input: &OutcomeInput,
    ) -> kb::KbResult<kb::models::OutcomeResult> {
        record_outcome(&mut self.conn, &self.config, input, "agent:test")
    }

    pub fn open_second(&self) -> Connection {
        let conn = db::open(&self.db_path).expect("open second");
        db::init(&conn).expect("init second");
        conn
    }
}

pub fn propose_input(product: &str, subject: &str) -> ProposeInput {
    ProposeInput {
        product_id: product.to_string(),
        subject_key: subject.to_string(),
        kind: "piege".to_string(),
        title: format!("Sujet {subject}"),
        correction: format!("Correction pour {subject}"),
        source: "agent".to_string(),
        symptom: None,
        cause: None,
        example: None,
        terms: vec![],
        identifiers: vec![],
        depends_on: vec![],
        product_version: None,
        incident_id: None,
        expected_version: None,
    }
}

pub fn mcp_call(server: &mut McpServer, name: &str, arguments: Value) -> Value {
    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments}
    });
    let response = server.handle(&request).expect("response");
    response
        .get("result")
        .and_then(|result| result.get("structuredContent"))
        .cloned()
        .unwrap_or(Value::Null)
}

pub fn error_code(value: &Value) -> Option<&str> {
    value
        .get("error")
        .and_then(|error| error.get("code"))
        .and_then(Value::as_str)
}

pub fn search_input(product: &str, query: &str) -> SearchInput {
    SearchInput {
        product_id: product.to_string(),
        query: Some(query.to_string()),
        terms: vec![],
        kinds: vec![],
        limit: None,
        offset: None,
    }
}
