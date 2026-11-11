use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub event_id: String,
    pub timestamp: String,
    pub initiator: String,
    pub target_invariant_id: String,
    pub reason: String,
    pub previous_hash: String,
    pub new_hash: String,
    pub diff: String,
    pub approved_by: String,
}

pub struct AuditLogger {
    log_path: PathBuf,
}

impl AuditLogger {
    pub fn new(root: impl AsRef<Path>, log_rel_path: &str) -> Self {
        Self {
            log_path: root.as_ref().join(log_rel_path),
        }
    }

    pub fn append(&self, entry: &AuditEntry) -> Result<(), String> {
        if let Some(parent) = self.log_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let mut line = serde_json::to_string(entry).map_err(|e| e.to_string())?;
        line.push('\n');

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
            .map_err(|e| format!("Ouverture audit.log: {}", e))?;

        file.write_all(line.as_bytes())
            .map_err(|e| format!("Écriture audit.log: {}", e))?;

        Ok(())
    }

    pub fn read_entries(&self) -> Result<Vec<AuditEntry>, String> {
        if !self.log_path.exists() {
            return Ok(Vec::new());
        }
        let content = fs::read_to_string(&self.log_path).map_err(|e| e.to_string())?;
        let mut entries = Vec::new();
        for line in content.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                if let Ok(e) = serde_json::from_str::<AuditEntry>(trimmed) {
                    entries.push(e);
                }
            }
        }
        Ok(entries)
    }
}

