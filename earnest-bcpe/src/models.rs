use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub product_id: String,
    pub name: String,
    pub current_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EntrySummary {
    pub entry_id: i64,
    pub subject_key: String,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub version: i64,
    pub excerpt: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryRow {
    pub entry_id: i64,
    pub product_id: String,
    pub subject_key: String,
    pub kind: String,
    pub title: String,
    pub symptom: Option<String>,
    pub cause: Option<String>,
    pub correction: String,
    pub example: Option<String>,
    pub status: String,
    pub product_version: Option<String>,
    pub source: String,
    pub validated_by: Option<String>,
    pub validated_at: Option<String>,
    pub use_count: i64,
    pub fail_count: i64,
    pub version: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl EntryRow {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(EntryRow {
            entry_id: row.get("entry_id")?,
            product_id: row.get("product_id")?,
            subject_key: row.get("subject_key")?,
            kind: row.get("kind")?,
            title: row.get("title")?,
            symptom: row.get("symptom")?,
            cause: row.get("cause")?,
            correction: row.get("correction")?,
            example: row.get("example")?,
            status: row.get("status")?,
            product_version: row.get("product_version")?,
            source: row.get("source")?,
            validated_by: row.get("validated_by")?,
            validated_at: row.get("validated_at")?,
            use_count: row.get("use_count")?,
            fail_count: row.get("fail_count")?,
            version: row.get("version")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentifierRow {
    pub entry_id: i64,
    pub product_id: String,
    pub identifier: String,
    pub state: String,
    pub replaced_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntrySnapshot {
    pub entry: EntryRow,
    pub terms: Vec<String>,
    pub identifiers: Vec<IdentifierRow>,
    pub depends_on: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EntryFull {
    pub entry: EntryRow,
    pub terms: Vec<String>,
    pub identifiers: Vec<IdentifierRow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<Vec<EntrySummary>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IdentifierInput {
    pub identifier: String,
    pub state: String,
    #[serde(default)]
    pub replaced_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ProposeInput {
    pub product_id: String,
    pub subject_key: String,
    pub kind: String,
    pub title: String,
    pub correction: String,
    pub source: String,
    #[serde(default)]
    pub symptom: Option<String>,
    #[serde(default)]
    pub cause: Option<String>,
    #[serde(default)]
    pub example: Option<String>,
    #[serde(default)]
    pub terms: Vec<String>,
    #[serde(default)]
    pub identifiers: Vec<IdentifierInput>,
    #[serde(default)]
    pub depends_on: Vec<i64>,
    #[serde(default)]
    pub product_version: Option<String>,
    #[serde(default)]
    pub incident_id: Option<i64>,
    #[serde(default)]
    pub expected_version: Option<i64>,
    #[serde(default)]
    pub auto_validate: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProposeResult {
    pub entry_id: i64,
    pub version: i64,
    pub status: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SearchInput {
    pub product_id: String,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub terms: Vec<String>,
    #[serde(default)]
    pub kinds: Vec<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResponse {
    pub results: Vec<EntrySummary>,
    pub covered: bool,
    pub more_available: bool,
    pub total: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CheckInput {
    pub product_id: String,
    #[serde(default)]
    pub identifiers: Vec<String>,
    #[serde(default)]
    pub script_text: Option<String>,
    #[serde(default)]
    pub script_kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Occurrence {
    pub line: usize,
    pub column: usize,
    #[serde(default)]
    pub context: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkedEntry {
    pub entry_id: i64,
    pub subject_key: String,
    pub title: String,
    pub status: String,
    pub state: String,
    pub replaced_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correction: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CheckVerdict {
    pub identifier: String,
    pub verdict: String,
    pub replaced_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hors_lexique: Option<bool>,
    pub entries_liees: Vec<LinkedEntry>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub occurrences: Vec<Occurrence>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct VerdictCounts {
    pub ok: i64,
    pub deprecie: i64,
    pub inexistant: i64,
    pub inconnu: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CheckResponse {
    pub summary: VerdictCounts,
    pub verdicts: Vec<CheckVerdict>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GetInput {
    #[serde(default)]
    pub product_id: Option<String>,
    #[serde(default)]
    pub subject_key: Option<String>,
    #[serde(default)]
    pub entry_id: Option<i64>,
    #[serde(default)]
    pub include_deps: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IncidentInput {
    pub product_id: String,
    pub expected: String,
    pub observed: String,
    #[serde(default)]
    pub script_ref: Option<String>,
    #[serde(default)]
    pub log_excerpt: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IncidentReport {
    pub incident_id: i64,
    pub nearby: Vec<EntrySummary>,
    pub covered: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct OutcomeInput {
    pub entry_id: i64,
    pub outcome: String,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OutcomeResult {
    pub entry_id: i64,
    pub use_count: i64,
    pub fail_count: i64,
    pub status: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct LintFinding {
    pub category: &'static str,
    pub product_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identifier: Option<String>,
    pub detail: String,
}
