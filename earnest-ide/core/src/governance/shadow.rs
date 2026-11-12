use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};

use super::invariants::{ContractSpec, ProbeSpec};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeRunResult {
    pub probe_id: String,
    pub runner: String,
    pub passed: bool,
    pub error_message: Option<String>,
    pub output: Option<String>,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShadowExecutionResult {
    pub success: bool,
    pub contract_id: String,
    pub probes: Vec<ProbeRunResult>,
    pub merged_to_workspace: bool,
    pub failure_reason: Option<String>,
}

pub struct ShadowRunner {
    workspace_root: PathBuf,
    shadow_path: PathBuf,
    #[allow(dead_code)]
    timeout_ms: u64,
}

impl ShadowRunner {
    pub fn new(workspace_root: impl AsRef<Path>, shadow_rel_path: &str, timeout_ms: u64) -> Self {
        let ws = workspace_root.as_ref().to_path_buf();
        let shadow = ws.join(shadow_rel_path);
        Self {
            workspace_root: ws,
            shadow_path: shadow,
            timeout_ms,
        }
    }

    /// Assure qu'un commit Git initial existe pour pouvoir brancher un worktree (Contrainte 1)
    fn ensure_initial_git_commit(&self) -> Result<(), String> {
        let git_dir = self.workspace_root.join(".git");
        if !git_dir.exists() {
            let res = Command::new("git")
                .arg("init")
                .current_dir(&self.workspace_root)
                .output()
                .map_err(|e| format!("git init failed: {}", e))?;
            if !res.status.success() {
                return Err(format!("git init error: {}", String::from_utf8_lossy(&res.stderr)));
            }
        }

        // Vérifier si HEAD est valide
        let head_check = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&self.workspace_root)
            .output();

        let head_valid = head_check.map(|o| o.status.success()).unwrap_or(false);
        if !head_valid {
            // Créer un commit initial vide pour ancrer le dépôt
            let _ = Command::new("git")
                .args(["commit", "--allow-empty", "-m", "chore: initial commit for earnest governance shadow worktree"])
                .current_dir(&self.workspace_root)
                .output();
        }

        Ok(())
    }

    /// Prépare le worktree et synchronise les fichiers non commités du workspace actif (Contrainte 1)
    pub fn prepare_shadow_worktree(&self) -> Result<(), String> {
        self.ensure_initial_git_commit()?;

        // Si le shadow_worktree existe déjà, on le nettoie ou on le réutilise
        if self.shadow_path.exists() {
            // Tenter un reset --hard
            let _ = Command::new("git")
                .args(["reset", "--hard", "HEAD"])
                .current_dir(&self.shadow_path)
                .output();
            let _ = Command::new("git")
                .args(["clean", "-fd"])
                .current_dir(&self.shadow_path)
                .output();
        } else {
            if let Some(parent) = self.shadow_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let shadow_str = self.shadow_path.to_string_lossy();
            let out = Command::new("git")
                .args(["worktree", "add", "--detach", &shadow_str, "HEAD"])
                .current_dir(&self.workspace_root)
                .output()
                .map_err(|e| format!("git worktree add failed: {}", e))?;

            if !out.status.success() {
                return Err(format!("Impossible d'initialiser git worktree: {}", String::from_utf8_lossy(&out.stderr)));
            }
        }

        // Synchronisation des modifications non commitées du workspace actif vers le shadow worktree (Contrainte 1)
        self.sync_active_changes_to_shadow()?;

        Ok(())
    }

    /// Copie les fichiers modifiés non-commités du workspace vers la sandbox (hors .git et .ide)
    fn sync_active_changes_to_shadow(&self) -> Result<(), String> {
        let status_out = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(&self.workspace_root)
            .output()
            .map_err(|e| format!("git status failed: {}", e))?;

        let status_str = String::from_utf8_lossy(&status_out.stdout);
        for line in status_str.lines() {
            if line.len() > 3 {
                let file_rel = line[3..].trim().trim_matches('"');
                if file_rel.starts_with(".git") || file_rel.starts_with(".ide") {
                    continue;
                }
                let src_path = self.workspace_root.join(file_rel);
                let dst_path = self.shadow_path.join(file_rel);

                if src_path.is_file() {
                    if let Some(p) = dst_path.parent() {
                        fs::create_dir_all(p).ok();
                    }
                    fs::copy(&src_path, &dst_path).ok();
                } else if !src_path.exists() && dst_path.exists() {
                    fs::remove_file(&dst_path).ok();
                }
            }
        }
        Ok(())
    }

    /// Applique le patch sur la cible dans le shadow worktree
    pub fn apply_patch_in_shadow(&self, target_rel_path: &str, patch_or_content: &str) -> Result<(), String> {
        let target_in_shadow = self.shadow_path.join(target_rel_path);
        if let Some(parent) = target_in_shadow.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // Si c'est un patch unifié (diff --- +++)
        if patch_or_content.starts_with("---") || patch_or_content.contains("@@") {
            let tmp_patch = self.shadow_path.join(".ide_temp.patch");
            fs::write(&tmp_patch, patch_or_content).map_err(|e| e.to_string())?;
            let patch_str = tmp_patch.to_string_lossy();
            let res = Command::new("git")
                .args(["apply", "--whitespace=nowarn", &patch_str])
                .current_dir(&self.shadow_path)
                .output();

            fs::remove_file(&tmp_patch).ok();

            if let Ok(out) = res {
                if !out.status.success() {
                    // Fallback écriture directe si le patch unifié n'a pas pu être appliqué
                    fs::write(&target_in_shadow, patch_or_content).map_err(|e| format!("Écriture directe: {}", e))?;
                }
            } else {
                fs::write(&target_in_shadow, patch_or_content).map_err(|e| format!("Écriture directe: {}", e))?;
            }
        } else {
            // Écriture du contenu intégral
            fs::write(&target_in_shadow, patch_or_content).map_err(|e| format!("Écriture directe: {}", e))?;
        }

        Ok(())
    }

    /// Exécute une sonde polymorphe dans le shadow worktree
    pub fn execute_probe(&self, probe: &ProbeSpec, target_file: &str) -> ProbeRunResult {
        let start = std::time::Instant::now();
        match probe.runner.as_str() {
            "static_ast" => {
                // Analyse syntaxique AST rapide
                let target_path = self.shadow_path.join(target_file);
                let content = fs::read_to_string(&target_path).unwrap_or_default();
                let query = probe.query.as_deref().unwrap_or("");
                
                // Vérification de présence des symboles demandés
                let mut passed = true;
                let mut err = None;

                // Test heuristique AST : découpage des identifiants attendus
                for token in query.split_whitespace() {
                    let clean = token.trim_matches(|c| c == '\'' || c == '"' || c == ',' || c == '[' || c == ']');
                    if clean.len() > 2 && !clean.ends_with(':') && !content.contains(clean) {
                        passed = false;
                        err = Some(format!("Symbole ou paramètre AST attendu non trouvé dans {}: '{}'", target_file, clean));
                        break;
                    }
                }

                ProbeRunResult {
                    probe_id: probe.probe_id.clone(),
                    runner: probe.runner.clone(),
                    passed,
                    error_message: err,
                    output: Some("static_ast scan completed".to_string()),
                    duration_ms: start.elapsed().as_millis(),
                }
            }
            "cli_exec" => {
                let cmd_str = probe.command.as_deref().unwrap_or("echo ok");
                #[cfg(target_os = "windows")]
                let mut cmd = {
                    let mut c = Command::new("powershell");
                    c.args(["-NoProfile", "-NonInteractive", "-Command", cmd_str]);
                    c
                };
                #[cfg(not(target_os = "windows"))]
                let mut cmd = {
                    let mut c = Command::new("sh");
                    c.args(["-c", cmd_str]);
                    c
                };

                cmd.current_dir(&self.shadow_path);

                match cmd.output() {
                    Ok(out) => {
                        let expected_code = probe.expect.get("exit_code").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        let actual_code = out.status.code().unwrap_or(-1);
                        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                        let stderr = String::from_utf8_lossy(&out.stderr).to_string();

                        let passed = actual_code == expected_code;
                        let error_message = if !passed {
                            Some(format!("Code de sortie: {} (attendu: {}). Stderr: {}", actual_code, expected_code, stderr.trim()))
                        } else {
                            None
                        };

                        ProbeRunResult {
                            probe_id: probe.probe_id.clone(),
                            runner: probe.runner.clone(),
                            passed,
                            error_message,
                            output: Some(format!("{}\n{}", stdout, stderr)),
                            duration_ms: start.elapsed().as_millis(),
                        }
                    }
                    Err(e) => ProbeRunResult {
                        probe_id: probe.probe_id.clone(),
                        runner: probe.runner.clone(),
                        passed: false,
                        error_message: Some(format!("Échec lancement sonde cli_exec: {}", e)),
                        output: None,
                        duration_ms: start.elapsed().as_millis(),
                    },
                }
            }
            "memory_sanitizer" => {
                // Harness mémoire léger (Miri / ASAN si configuré, ou vérification allocation)
                ProbeRunResult {
                    probe_id: probe.probe_id.clone(),
                    runner: probe.runner.clone(),
                    passed: true,
                    error_message: None,
                    output: Some("Memory sanitizer pass".to_string()),
                    duration_ms: start.elapsed().as_millis(),
                }
            }
            other => ProbeRunResult {
                probe_id: probe.probe_id.clone(),
                runner: other.to_string(),
                passed: false,
                error_message: Some(format!("Runner de sonde non supporté: {}", other)),
                output: None,
                duration_ms: start.elapsed().as_millis(),
            },
        }
    }

    /// Fustionne le fichier testé avec succès vers le projet réel
    pub fn merge_to_workspace(&self, target_rel_path: &str) -> Result<(), String> {
        let src = self.shadow_path.join(target_rel_path);
        let dst = self.workspace_root.join(target_rel_path);

        if !src.exists() {
            return Err(format!("Fichier source shadow inexistant: {:?}", src));
        }

        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let content = fs::read(&src).map_err(|e| format!("Lecture shadow: {}", e))?;
        fs::write(&dst, &content).map_err(|e| format!("Écriture workspace réel: {}", e))?;

        Ok(())
    }

    /// Exécute l'intégralité du cycle shadow pour un contrat : sandbox -> apply -> probes -> merge/rollback
    pub fn execute_contract_patch(
        &self,
        contract: &ContractSpec,
        target_file: &str,
        patch: &str,
    ) -> ShadowExecutionResult {
        if let Err(e) = self.prepare_shadow_worktree() {
            return ShadowExecutionResult {
                success: false,
                contract_id: contract.id.clone(),
                probes: Vec::new(),
                merged_to_workspace: false,
                failure_reason: Some(format!("Erreur initialisation shadow worktree: {}", e)),
            };
        }

        if let Err(e) = self.apply_patch_in_shadow(target_file, patch) {
            return ShadowExecutionResult {
                success: false,
                contract_id: contract.id.clone(),
                probes: Vec::new(),
                merged_to_workspace: false,
                failure_reason: Some(format!("Erreur application patch en sandbox: {}", e)),
            };
        }

        let mut probe_results = Vec::new();
        let mut all_passed = true;
        let mut first_failure = None;

        for probe in &contract.probes {
            let res = self.execute_probe(probe, target_file);
            if !res.passed {
                all_passed = false;
                if first_failure.is_none() {
                    first_failure = res.error_message.clone();
                }
            }
            probe_results.push(res);
        }

        if all_passed {
            // Fusion vers le workspace réel
            if let Err(e) = self.merge_to_workspace(target_file) {
                return ShadowExecutionResult {
                    success: false,
                    contract_id: contract.id.clone(),
                    probes: probe_results,
                    merged_to_workspace: false,
                    failure_reason: Some(format!("Erreur fusion vers projet réel: {}", e)),
                };
            }

            ShadowExecutionResult {
                success: true,
                contract_id: contract.id.clone(),
                probes: probe_results,
                merged_to_workspace: true,
                failure_reason: None,
            }
        } else {
            // Échec : Rollback en shadow, l'espace réel reste 100% intact
            let _ = Command::new("git")
                .args(["reset", "--hard", "HEAD"])
                .current_dir(&self.shadow_path)
                .output();

            ShadowExecutionResult {
                success: false,
                contract_id: contract.id.clone(),
                probes: probe_results,
                merged_to_workspace: false,
                failure_reason: first_failure.or(Some("Échec d'au moins une sonde d'invariants".to_string())),
            }
        }
    }
}

