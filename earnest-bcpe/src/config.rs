use std::collections::BTreeMap;
use std::env;
use std::path::{Path, PathBuf};

use regex::Regex;
use serde::Deserialize;

use crate::error::{KbError, KbResult};

const DEFAULT_EXTRACTORS: &str = include_str!("../config/extractors.yaml");
const DEFAULT_REDACTION: &str = include_str!("../config/redaction.yaml");

#[derive(Debug, Clone)]
pub struct CompiledPattern {
    pub regex: Regex,
    pub group: usize,
}

#[derive(Debug, Clone)]
pub struct Extractor {
    pub patterns: Vec<CompiledPattern>,
}

#[derive(Debug, Clone)]
pub struct RedactionRule {
    pub regex: Regex,
    pub replacement: String,
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub extractors: BTreeMap<String, Extractor>,
    pub redaction: Vec<RedactionRule>,
    pub config_dir: Option<PathBuf>,
}

#[derive(Deserialize)]
struct ExtractorsFile {
    extractors: BTreeMap<String, ExtractorDef>,
}

#[derive(Deserialize)]
struct ExtractorDef {
    #[serde(default)]
    patterns: Vec<PatternDef>,
    #[serde(default)]
    engine: Option<String>,
}

#[derive(Deserialize)]
struct PatternDef {
    regex: String,
    #[serde(default)]
    group: Option<usize>,
}

#[derive(Deserialize)]
struct RedactionFile {
    redaction: RedactionSection,
}

#[derive(Deserialize)]
struct RedactionSection {
    patterns: Vec<RedactionRuleDef>,
}

#[derive(Deserialize)]
struct RedactionRuleDef {
    regex: String,
    replacement: String,
}

fn find_config_dir(explicit: Option<&Path>) -> Option<PathBuf> {
    if let Some(dir) = explicit {
        return Some(dir.to_path_buf());
    }
    if let Ok(dir) = env::var("KB_CONFIG_DIR") {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    if let Ok(cwd) = env::current_dir() {
        let candidate = cwd.join("config");
        if candidate.join("extractors.yaml").exists() || candidate.join("redaction.yaml").exists() {
            return Some(candidate);
        }
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join("config");
            if candidate.join("extractors.yaml").exists()
                || candidate.join("redaction.yaml").exists()
            {
                return Some(candidate);
            }
        }
    }
    None
}

fn read_or_default(path: &Path, default: &str) -> KbResult<String> {
    if path.exists() {
        Ok(std::fs::read_to_string(path).map_err(KbError::Io)?)
    } else {
        Ok(default.to_string())
    }
}

fn compile_extractors(yaml: &str) -> KbResult<BTreeMap<String, Extractor>> {
    let parsed: ExtractorsFile = yaml_serde::from_str(yaml)
        .map_err(|e| KbError::Config(format!("extractors.yaml invalide: {e}")))?;
    let mut output = BTreeMap::new();
    for (kind, def) in parsed.extractors {
        if let Some(engine) = &def.engine {
            if !engine.eq_ignore_ascii_case("regex") {
                return Err(KbError::Config(format!(
                    "extracteur '{kind}': moteur '{engine}' non pris en charge (regex seulement)"
                )));
            }
        }
        let mut patterns = Vec::new();
        for p in def.patterns {
            let regex = Regex::new(&p.regex).map_err(|e| {
                KbError::Config(format!("extracteur '{kind}', motif '{}': {e}", p.regex))
            })?;
            patterns.push(CompiledPattern {
                regex,
                group: p.group.unwrap_or(0),
            });
        }
        output.insert(kind, Extractor { patterns });
    }
    Ok(output)
}

fn compile_redaction(yaml: &str) -> KbResult<Vec<RedactionRule>> {
    let parsed: RedactionFile = yaml_serde::from_str(yaml)
        .map_err(|e| KbError::Config(format!("redaction.yaml invalide: {e}")))?;
    let mut output = Vec::new();
    for rule in parsed.redaction.patterns {
        let regex = Regex::new(&rule.regex)
            .map_err(|e| KbError::Config(format!("motif de masquage '{}': {e}", rule.regex)))?;
        output.push(RedactionRule {
            regex,
            replacement: rule.replacement,
        });
    }
    Ok(output)
}

impl AppConfig {
    pub fn load(explicit_dir: Option<&Path>) -> KbResult<Self> {
        let config_dir = find_config_dir(explicit_dir);
        let (extractors_yaml, redaction_yaml) = match &config_dir {
            Some(dir) => (
                read_or_default(&dir.join("extractors.yaml"), DEFAULT_EXTRACTORS)?,
                read_or_default(&dir.join("redaction.yaml"), DEFAULT_REDACTION)?,
            ),
            None => (
                DEFAULT_EXTRACTORS.to_string(),
                DEFAULT_REDACTION.to_string(),
            ),
        };
        Ok(AppConfig {
            extractors: compile_extractors(&extractors_yaml)?,
            redaction: compile_redaction(&redaction_yaml)?,
            config_dir,
        })
    }

    pub fn extractor(&self, kind: &str) -> Option<&Extractor> {
        self.extractors.get(kind)
    }
}

pub fn home_dir() -> Option<PathBuf> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
}

pub fn default_data_dir() -> PathBuf {
    match home_dir() {
        Some(home) => home.join(".local").join("share").join("earnest-bcpe"),
        None => PathBuf::from("."),
    }
}

pub fn default_db_path() -> PathBuf {
    if let Some(path) = env::var_os("KB_DB") {
        return PathBuf::from(path);
    }
    default_data_dir().join("kb.db")
}
