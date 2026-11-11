use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GovernanceMode {
    Normal,
    Architecture,
    Constrained,
}

impl Default for GovernanceMode {
    fn default() -> Self {
        GovernanceMode::Normal
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShadowEnvConfig {
    pub engine: String,
    pub path: String,
    pub timeout_ms: u64,
}

impl Default for ShadowEnvConfig {
    fn default() -> Self {
        Self {
            engine: "git_worktree".to_string(),
            path: ".ide/shadow_worktree".to_string(),
            timeout_ms: 15000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardrailsConfig {
    pub max_consecutive_failures: usize,
    pub topological_enforcement: bool,
}

impl Default for GuardrailsConfig {
    fn default() -> Self {
        Self {
            max_consecutive_failures: 3,
            topological_enforcement: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyConfig {
    pub version: String,
    pub mode: GovernanceMode,
    pub invariants_file: String,
    pub lock_file: String,
    pub audit_log: String,
    pub shadow_env: ShadowEnvConfig,
    pub guardrails: GuardrailsConfig,
}

impl Default for PolicyConfig {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            mode: GovernanceMode::Normal,
            invariants_file: ".ide/invariants.json".to_string(),
            lock_file: ".ide/invariants.lock".to_string(),
            audit_log: ".ide/audit.log".to_string(),
            shadow_env: ShadowEnvConfig::default(),
            guardrails: GuardrailsConfig::default(),
        }
    }
}

pub struct PolicyManager {
    root_path: PathBuf,
}

impl PolicyManager {
    pub fn new(root_path: impl AsRef<Path>) -> Self {
        Self {
            root_path: root_path.as_ref().to_path_buf(),
        }
    }

    pub fn ide_dir(&self) -> PathBuf {
        self.root_path.join(".ide")
    }

    pub fn policy_file(&self) -> PathBuf {
        self.ide_dir().join("policy.json")
    }

    pub fn ensure_ide_dir(&self) -> std::io::Result<()> {
        let dir = self.ide_dir();
        if !dir.exists() {
            fs::create_dir_all(&dir)?;
        }
        Ok(())
    }

    /// Charge ou initialise policy.json avec garde-fou pour Mode 2 (Contrainte 4)
    pub fn load_or_init(&self, requested_mode: Option<GovernanceMode>) -> Result<PolicyConfig, String> {
        self.ensure_ide_dir().map_err(|e| format!("Erreur création .ide: {}", e))?;
        let pfile = self.policy_file();

        let mut policy: PolicyConfig = if pfile.exists() {
            let content = fs::read_to_string(&pfile).map_err(|e| format!("Lecture policy.json: {}", e))?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            PolicyConfig::default()
        };

        // Si l'utilisateur demande explicitement un mode au démarrage
        if let Some(m) = requested_mode {
            policy.mode = m;
        }

        // Garde-fou Contrainte 4 : Si le mode est 'constrained' mais qu'aucun couple invariants.json / invariants.lock valide n'existe
        if policy.mode == GovernanceMode::Constrained {
            let inv_path = self.root_path.join(&policy.invariants_file);
            let lock_path = self.root_path.join(&policy.lock_file);

            if !inv_path.exists() || !lock_path.exists() {
                // Bascule automatiquement en mode architecture pour éviter tout crash d'intégrité
                policy.mode = GovernanceMode::Architecture;
            } else {
                // Vérifier l'intégrité du hash
                if let Err(_) = crate::governance::invariants::verify_invariants_lock(&self.root_path, &policy.invariants_file, &policy.lock_file) {
                    policy.mode = GovernanceMode::Architecture;
                }
            }
        }

        self.save(&policy)?;
        Ok(policy)
    }

    pub fn save(&self, policy: &PolicyConfig) -> Result<(), String> {
        self.ensure_ide_dir().map_err(|e| format!("Erreur création .ide: {}", e))?;
        let pfile = self.policy_file();
        let content = serde_json::to_string_pretty(policy).map_err(|e| e.to_string())?;
        fs::write(&pfile, content).map_err(|e| format!("Écriture policy.json: {}", e))?;
        Ok(())
    }

    pub fn set_mode(&self, mode: GovernanceMode) -> Result<PolicyConfig, String> {
        let mut policy = self.load_or_init(None)?;
        policy.mode = mode;
        self.save(&policy)?;
        Ok(policy)
    }
}
