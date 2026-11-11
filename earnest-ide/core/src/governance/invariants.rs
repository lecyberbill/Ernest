use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolSpec {
    pub name: String,
    pub signature: String,
    #[serde(default)]
    pub preconditions: Vec<String>,
    #[serde(default)]
    pub postconditions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeSpec {
    pub probe_id: String,
    /// 'static_ast' | 'cli_exec' | 'memory_sanitizer'
    pub runner: String,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub expect: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractSpec {
    pub id: String,
    /// 'C0' | 'C1' | 'C2' | 'C3'
    pub criticality: String,
    pub target_file: String,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub symbols: Vec<SymbolSpec>,
    #[serde(default)]
    pub probes: Vec<ProbeSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvariantsFile {
    pub schema_version: String,
    pub project_id: String,
    pub contracts: Vec<ContractSpec>,
}

impl Default for InvariantsFile {
    fn default() -> Self {
        Self {
            schema_version: "1.0.0".to_string(),
            project_id: "earnest-project".to_string(),
            contracts: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvariantsLock {
    pub target_file: String,
    pub algorithm: String,
    pub hash: String,
    pub sealed_at: String,
}

/// Calcule le SHA-256 d'un tableau d'octets
pub fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    format!("{:x}", result)
}

/// Règle les permissions en lecture seule (chmod 444 / readonly)
pub fn set_file_readonly(path: &Path, readonly: bool) -> std::io::Result<()> {
    if !path.exists() {
        return Ok(());
    }
    let mut perms = fs::metadata(path)?.permissions();
    perms.set_readonly(readonly);
    fs::set_permissions(path, perms)?;
    Ok(())
}

/// Vérifie l'intégrité cryptographique entre invariants.json et invariants.lock
pub fn verify_invariants_lock(root: &Path, inv_rel_path: &str, lock_rel_path: &str) -> Result<String, String> {
    let inv_path = root.join(inv_rel_path);
    let lock_path = root.join(lock_rel_path);

    if !inv_path.exists() {
        return Err(format!("Fichier d'invariants introuvable: {:?}", inv_path));
    }
    if !lock_path.exists() {
        return Err(format!("Fichier de scellement (.lock) introuvable: {:?}", lock_path));
    }

    let inv_bytes = fs::read(&inv_path).map_err(|e| format!("Lecture invariants.json: {}", e))?;
    let current_hash = sha256_hex(&inv_bytes);

    let lock_content = fs::read_to_string(&lock_path).map_err(|e| format!("Lecture invariants.lock: {}", e))?;
    let lock_obj: InvariantsLock = serde_json::from_str(&lock_content)
        .map_err(|e| format!("Parsing invariants.lock invalide: {}", e))?;

    if current_hash != lock_obj.hash {
        return Err(format!(
            "VIOLATION D'INTÉGRITÉ CRYPTOGRAPHIQUE : hash actuel ({}) != hash scellé ({})",
            current_hash, lock_obj.hash
        ));
    }

    Ok(current_hash)
}

/// Scelle les invariants : écrit invariants.json, calcule le SHA-256, écrit invariants.lock
/// et applique set_readonly(true) sur les DEUX fichiers (Contrainte 3)
pub fn seal_invariants(root: &Path, inv_rel_path: &str, lock_rel_path: &str, content_json: &InvariantsFile) -> Result<String, String> {
    let inv_path = root.join(inv_rel_path);
    let lock_path = root.join(lock_rel_path);

    // Déverrouillage préalable si les fichiers existent déjà
    set_file_readonly(&inv_path, false).ok();
    set_file_readonly(&lock_path, false).ok();

    if let Some(parent) = inv_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if let Some(parent) = lock_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let raw_bytes = serde_json::to_vec_pretty(content_json).map_err(|e| e.to_string())?;
    let hash = sha256_hex(&raw_bytes);

    fs::write(&inv_path, &raw_bytes).map_err(|e| format!("Écriture {:?}: {}", inv_path, e))?;

    let lock_data = InvariantsLock {
        target_file: inv_rel_path.to_string(),
        algorithm: "sha256".to_string(),
        hash: hash.clone(),
        sealed_at: chrono::Utc::now().to_rfc3339(),
    };
    let lock_bytes = serde_json::to_vec_pretty(&lock_data).map_err(|e| e.to_string())?;
    fs::write(&lock_path, &lock_bytes).map_err(|e| format!("Écriture {:?}: {}", lock_path, e))?;

    // Application stricte du verrouillage OS en lecture seule (chmod 444 / set_readonly(true))
    set_file_readonly(&inv_path, true).map_err(|e| format!("chmod 444 invariants.json: {}", e))?;
    set_file_readonly(&lock_path, true).map_err(|e| format!("chmod 444 invariants.lock: {}", e))?;

    Ok(hash)
}

/// Applique une mutation assistée de contrat en gérant temporairement les permissions (Contrainte 3)
pub fn mutate_invariants<F>(root: &Path, inv_rel_path: &str, lock_rel_path: &str, mutator: F) -> Result<String, String> 
where
    F: FnOnce(&mut InvariantsFile) -> Result<(), String>,
{
    let inv_path = root.join(inv_rel_path);
    let lock_path = root.join(lock_rel_path);

    // 1. Déverrouillage explicite (set_readonly(false))
    set_file_readonly(&inv_path, false).map_err(|e| format!("Unlock invariants.json: {}", e))?;
    set_file_readonly(&lock_path, false).map_err(|e| format!("Unlock invariants.lock: {}", e))?;

    // 2. Lecture et application de la modification
    let inv_content = fs::read_to_string(&inv_path).map_err(|e| format!("Read invariants.json: {}", e))?;
    let mut inv_data: InvariantsFile = serde_json::from_str(&inv_content).map_err(|e| format!("Parse invariants: {}", e))?;

    mutator(&mut inv_data)?;

    // 3. Ré-écriture, calcul du nouveau hash et re-scellement immédiat (set_readonly(true))
    seal_invariants(root, inv_rel_path, lock_rel_path, &inv_data)
}

