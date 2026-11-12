use std::path::{Path, PathBuf};
use serde_json::{json, Value};
use rusqlite::Connection;

use crate::db::connection::get_connection;
use crate::db::memories::MemoryService;
use crate::tools::fs::{read_file, write_file, edit_file};
use crate::tools::search::{grep_search, list_files};
use crate::tools::git::{get_git_status, get_git_diff};
use crate::tools::diagnostics::run_project_diagnostics;
use crate::governance::{
    PolicyManager, InvariantsFile, verify_invariants_lock,
    ShadowRunner, AuditLogger
};

fn tool_result(value: Value) -> Value {
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".to_string());
    json!({
        "content": [{"type": "text", "text": text}],
        "structuredContent": value,
        "isError": false
    })
}

fn tool_error(message: impl Into<String>) -> Value {
    let msg = message.into();
    let payload = json!({
        "error": {
            "message": msg
        }
    });
    let text = serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string());
    json!({
        "content": [{"type": "text", "text": text}],
        "structuredContent": payload,
        "isError": true
    })
}

fn jsonrpc_result(id: Value, result: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "result": result})
}

fn jsonrpc_error(id: Value, code: i64, message: String) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {"code": code, "message": message}
    })
}

pub fn tool_definitions() -> Vec<Value> {
    vec![
        // 1. Exploration & Lecture
        json!({
            "name": "ide_read_file",
            "description": "Lit le contenu d'un fichier source avec numéros de lignes précis et pagination optionnelle.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Chemin du fichier à lire" },
                    "start_line": { "type": "integer", "description": "Ligne de début (optionnel)" },
                    "end_line": { "type": "integer", "description": "Ligne de fin incluse (optionnel)" }
                },
                "required": ["path"]
            }
        }),
        json!({
            "name": "ide_list_files",
            "description": "Liste les fichiers du workspace en arborescence (ignore .git et caches générés).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "root_path": { "type": "string", "description": "Répertoire racine (défaut '.')" },
                    "max_depth": { "type": "integer", "description": "Profondeur maximale" }
                }
            }
        }),
        json!({
            "name": "ide_grep_search",
            "description": "Recherche par regex ou mot-clé dans les fichiers du projet (respecte .gitignore).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Texte ou expression régulière cherchée" },
                    "root_path": { "type": "string", "description": "Dossier racine" },
                    "max_results": { "type": "integer", "description": "Nombre maximal de correspondances" }
                },
                "required": ["query"]
            }
        }),

        // 2. Modification & Édition
        json!({
            "name": "ide_edit_file",
            "description": "Modifie chirurgicalement un fichier en remplaçant exactement le bloc target par replacement.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Chemin du fichier à modifier" },
                    "target": { "type": "string", "description": "Bloc de texte exact à remplacer" },
                    "replacement": { "type": "string", "description": "Nouveau bloc de remplacement" }
                },
                "required": ["path", "target", "replacement"]
            }
        }),
        json!({
            "name": "ide_write_file",
            "description": "Écrit ou remplace intégralement un fichier du projet.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Chemin du fichier" },
                    "content": { "type": "string", "description": "Contenu complet" }
                },
                "required": ["path", "content"]
            }
        }),

        // 3. Exécution Terminal & Diagnostics
        json!({
            "name": "ide_terminal_exec",
            "description": "Exécute une commande terminal (cargo, npm, pytest, etc.) dans l'environnement de travail.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "Ligne de commande à exécuter" },
                    "timeout_sec": { "type": "integer", "description": "Délai limite en secondes (défaut 60)" }
                },
                "required": ["command"]
            }
        }),
        json!({
            "name": "ide_git_status",
            "description": "Consulte le statut Git du workspace courant (branche, fichiers modifiés, index).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "root_path": { "type": "string", "description": "Répertoire racine (défaut '.')" }
                }
            }
        }),
        json!({
            "name": "ide_git_diff",
            "description": "Extrait le diff unifié Git des modifications courantes du workspace.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "root_path": { "type": "string", "description": "Répertoire racine (défaut '.')" },
                    "file": { "type": "string", "description": "Fichier optionnel pour diff ciblé" }
                }
            }
        }),
        json!({
            "name": "ide_diagnostics",
            "description": "Lance les diagnostics compilateur / linter du projet (cargo check, tsc, pyright).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "root_path": { "type": "string", "description": "Répertoire racine du projet" }
                }
            }
        }),

        // 4. Mémoire & Contexte
        json!({
            "name": "ide_store_memory",
            "description": "Enregistre une décision d'architecture, convention ou bug récurrent dans la base de mémoire pérenne de Earnest.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_id": { "type": "string", "description": "Identifiant du projet" },
                    "key": { "type": "string", "description": "Clé mémorisable" },
                    "content": { "type": "string", "description": "Contenu détaillé à retenir" },
                    "scope": { "type": "string", "enum": ["project", "session"], "description": "Portée de mémorisation" }
                },
                "required": ["project_id", "key", "content"]
            }
        }),
        json!({
            "name": "ide_recall_memory",
            "description": "Retrouve une mémoire précédemment persistée par sa clé.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_id": { "type": "string", "description": "Identifiant du projet" },
                    "key": { "type": "string", "description": "Clé mémorisée" }
                },
                "required": ["project_id", "key"]
            }
        }),

        // 5. Gouvernance Déterministe d'Invariants
        json!({
            "name": "ide_governance_status",
            "description": "Consulte le statut de gouvernance par invariants cryptographiques (Mode 1 Normal, Mode 3 Archi, Mode 2 Contraint, sceau SHA-256, intégrité).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "root_path": { "type": "string", "description": "Répertoire racine du projet (défaut '.')" }
                }
            }
        }),
        json!({
            "name": "ide_write_code_shadow",
            "description": "Applique un patch de code sous contrôle shadow sandbox (git worktree) et vérifie 100% des sondes d'invariants scellées avant toute fusion dans l'espace de travail réel.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "root_path": { "type": "string", "description": "Répertoire racine du projet" },
                    "contract_id": { "type": "string", "description": "Identifiant du contrat d'invariants (ex: 'contract_allocator')" },
                    "target_file": { "type": "string", "description": "Fichier source ciblé" },
                    "patch": { "type": "string", "description": "Contenu complet ou diff unifié à appliquer" }
                },
                "required": ["contract_id", "target_file", "patch"]
            }
        }),

        // 6. Délégation Agentique Autonome (Moteur ReAct Earnest-IDE)
        json!({
            "name": "ide_agent_run",
            "description": "Délègue une mission complexe en langage naturel à l'agent de programmation interne de Earnest-IDE. L'agent autonome analyse le contexte, utilise ses outils et résout la tâche de bout en bout en respectant le mode de gouvernance actif.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "prompt": { "type": "string", "description": "Instruction ou mission détaillée à accomplir par l'agent" },
                    "project_id": { "type": "string", "description": "Identifiant ou chemin racine du projet (défaut workspace courant)" }
                },
                "required": ["prompt"]
            }
        })
    ]
}

pub struct McpServer {
    conn: Connection,
    workspace_root: PathBuf,
}

impl McpServer {
    pub fn new(root: impl AsRef<Path>) -> Self {
        let conn = get_connection(None).expect("Connexion base Earnest impossible");
        Self {
            conn,
            workspace_root: root.as_ref().to_path_buf(),
        }
    }

    fn resolve_path(&self, p: &str) -> PathBuf {
        let path = Path::new(p);
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.workspace_root.join(p)
        }
    }

    fn call_tool(&mut self, name: &str, args: &Value) -> Result<Value, String> {
        match name {
            "ide_read_file" => {
                let path = args["path"].as_str().unwrap_or("");
                let resolved = self.resolve_path(path);
                let start = args["start_line"].as_u64().map(|v| v as usize);
                let end = args["end_line"].as_u64().map(|v| v as usize);
                read_file(resolved.to_str().unwrap_or(path), start, end)
            }
            "ide_list_files" => {
                let r = args["root_path"].as_str().map(|s| self.resolve_path(s)).unwrap_or_else(|| self.workspace_root.clone());
                let depth = args["max_depth"].as_u64().map(|v| v as usize);
                list_files(r.to_str().unwrap_or("."), depth)
            }
            "ide_grep_search" => {
                let query = args["query"].as_str().unwrap_or("");
                let r = args["root_path"].as_str().map(|s| self.resolve_path(s)).unwrap_or_else(|| self.workspace_root.clone());
                let max = args["max_results"].as_u64().map(|v| v as usize);
                grep_search(r.to_str().unwrap_or("."), query, max)
            }
            "ide_edit_file" => {
                let path = args["path"].as_str().unwrap_or("");
                let resolved = self.resolve_path(path);
                let target = args["target"].as_str().unwrap_or("");
                let replacement = args["replacement"].as_str().unwrap_or("");
                edit_file(resolved.to_str().unwrap_or(path), target, replacement)
            }
            "ide_write_file" => {
                let path = args["path"].as_str().unwrap_or("");
                let resolved = self.resolve_path(path);
                let content = args["content"].as_str().unwrap_or("");
                write_file(resolved.to_str().unwrap_or(path), content)
            }
            "ide_terminal_exec" => {
                let cmd = args["command"].as_str().unwrap_or("");
                let timeout = args["timeout_sec"].as_u64().unwrap_or(60);
                crate::tools::terminal::execute_terminal_in_dir(cmd, timeout, Some(&self.workspace_root))
            }
            "ide_git_status" => {
                let r = args["root_path"].as_str().map(|s| self.resolve_path(s)).unwrap_or_else(|| self.workspace_root.clone());
                get_git_status(r.to_str().unwrap_or("."))
            }
            "ide_git_diff" => {
                let r = args["root_path"].as_str().map(|s| self.resolve_path(s)).unwrap_or_else(|| self.workspace_root.clone());
                let file = args["file"].as_str();
                get_git_diff(r.to_str().unwrap_or("."), file)
            }
            "ide_diagnostics" => {
                let r = args["root_path"].as_str().map(|s| self.resolve_path(s)).unwrap_or_else(|| self.workspace_root.clone());
                run_project_diagnostics(r.to_str().unwrap_or("."))
            }
            "ide_store_memory" => {
                let pid = args["project_id"].as_str().unwrap_or("earnest");
                let key = args["key"].as_str().unwrap_or("");
                let content = args["content"].as_str().unwrap_or("");
                let scope = args["scope"].as_str().unwrap_or("project");
                let mem = MemoryService::new(&self.conn);
                mem.store_memory(pid, key, content, scope, None)
                    .map(|msg| json!({"status": "success", "message": msg}))
                    .map_err(|e| e.to_string())
            }
            "ide_recall_memory" => {
                let pid = args["project_id"].as_str().unwrap_or("earnest");
                let key = args["key"].as_str().unwrap_or("");
                let mem = MemoryService::new(&self.conn);
                match mem.recall_memory(pid, key, None) {
                    Ok(Some(val)) => Ok(json!({"status": "success", "key": key, "content": val})),
                    Ok(None) => Ok(json!({"status": "not_found", "message": format!("Aucune mémoire pour '{}'", key)})),
                    Err(e) => Err(e.to_string()),
                }
            }
            "ide_governance_status" => {
                let r = args["root_path"].as_str().map(|s| self.resolve_path(s)).unwrap_or_else(|| self.workspace_root.clone());
                let pm = PolicyManager::new(&r);
                let policy = pm.load_or_init(None).unwrap_or_default();
                let integrity = verify_invariants_lock(&r, &policy.invariants_file, &policy.lock_file)
                    .map(|h| json!({"status": "verified", "sha256": h}))
                    .unwrap_or_else(|e| json!({"status": "unverified", "error": e}));
                let logger = AuditLogger::new(&r, &policy.audit_log);
                let entries = logger.read_entries().unwrap_or_default();

                Ok(json!({
                    "mode": policy.mode,
                    "version": policy.version,
                    "invariants_file": policy.invariants_file,
                    "lock_file": policy.lock_file,
                    "integrity": integrity,
                    "audit_entries_count": entries.len(),
                    "shadow_env": policy.shadow_env,
                    "guardrails": policy.guardrails
                }))
            }
            "ide_write_code_shadow" => {
                let r = args["root_path"].as_str().map(|s| self.resolve_path(s)).unwrap_or_else(|| self.workspace_root.clone());
                let contract_id = args["contract_id"].as_str().unwrap_or("");
                let target_file = args["target_file"].as_str().unwrap_or("");
                let patch = args["patch"].as_str().unwrap_or("");

                let pm = PolicyManager::new(&r);
                let policy = pm.load_or_init(None).unwrap_or_default();

                // Intégrité
                verify_invariants_lock(&r, &policy.invariants_file, &policy.lock_file)
                    .map_err(|e| format!("Arrêt : Violation de l'intégrité du scellement d'invariants : {}", e))?;

                let inv_path = r.join(&policy.invariants_file);
                let inv_content = std::fs::read_to_string(&inv_path).map_err(|e| e.to_string())?;
                let inv_file: InvariantsFile = serde_json::from_str(&inv_content).map_err(|e| e.to_string())?;

                let contract = inv_file.contracts.into_iter().find(|c| c.id == contract_id)
                    .ok_or_else(|| format!("Contrat d'invariants '{}' introuvable", contract_id))?;

                let runner = ShadowRunner::new(&r, &policy.shadow_env.path, policy.shadow_env.timeout_ms);
                let result = runner.execute_contract_patch(&contract, target_file, patch);

                Ok(json!({
                    "success": result.success,
                    "contract_id": result.contract_id,
                    "merged_to_workspace": result.merged_to_workspace,
                    "failure_reason": result.failure_reason,
                    "probes": result.probes
                }))
            }
            "ide_agent_run" => {
                let prompt = args["prompt"].as_str().unwrap_or("");
                let proj = args["project_id"].as_str().unwrap_or(self.workspace_root.to_str().unwrap_or("."));
                let router = crate::llm::router::LLMRouter::from_db(&self.conn);
                let engine = crate::engine::react::ReActEngine::new(&self.conn, &router, proj)
                    .with_workspace(&self.workspace_root);

                let res = engine.run(prompt)?;

                Ok(json!({
                    "run_id": res.run_id,
                    "status": res.status,
                    "answer": res.answer,
                    "steps_count": res.steps_count,
                    "total_tokens": res.total_tokens,
                    "duration_ms": res.duration_ms
                }))
            }
            other => Err(format!("Outil MCP Earnest IDE inconnu: '{}'", other)),
        }
    }

    pub fn handle(&mut self, request: &Value) -> Option<Value> {
        let id = request.get("id").cloned().unwrap_or(Value::Null);
        let method = match request.get("method").and_then(Value::as_str) {
            Some(m) => m,
            None => return Some(jsonrpc_error(id, -32600, "Method JSON-RPC manquante".into())),
        };

        match method {
            "initialize" => {
                let requested = request
                    .pointer("/params/protocolVersion")
                    .and_then(Value::as_str)
                    .unwrap_or("2024-11-05");
                Some(jsonrpc_result(
                    id,
                    json!({
                        "protocolVersion": requested,
                        "capabilities": { "tools": {} },
                        "serverInfo": {
                            "name": "earnest-ide",
                            "version": "1.0.0",
                            "description": "Serveur MCP universel Earnest IDE pour orchestration agentique & gouvernance"
                        }
                    }),
                ))
            }
            "ping" => Some(jsonrpc_result(id, json!({}))),
            "tools/list" => Some(jsonrpc_result(id, json!({ "tools": tool_definitions() }))),
            "tools/call" => {
                let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
                let name = match params.get("name").and_then(Value::as_str) {
                    Some(n) => n.to_string(),
                    None => return Some(jsonrpc_error(id, -32602, "params.name est obligatoire".to_string())),
                };
                let arguments = params.get("arguments").cloned().unwrap_or_else(|| json!({}));

                let result = self.call_tool(&name, &arguments);
                let formatted = match result {
                    Ok(val) => tool_result(val),
                    Err(err) => tool_error(err),
                };
                Some(jsonrpc_result(id, formatted))
            }
            other => Some(jsonrpc_error(id, -32601, format!("Méthode MCP non supportée: '{}'", other))),
        }
    }

    pub fn run_stdio(&mut self) -> Result<(), String> {
        use std::io::{BufRead, Write};

        let stdin = std::io::stdin();
        let stdout = std::io::stdout();
        let mut output = stdout.lock();

        for line in stdin.lock().lines() {
            let line = line.map_err(|e| e.to_string())?;
            if line.trim().is_empty() {
                continue;
            }
            let request: Value = match serde_json::from_str(&line) {
                Ok(val) => val,
                Err(e) => {
                    let resp = jsonrpc_error(Value::Null, -32700, format!("Erreur parse JSON: {}", e));
                    let _ = writeln!(output, "{}", serde_json::to_string(&resp).unwrap_or_default());
                    output.flush().map_err(|e| e.to_string())?;
                    continue;
                }
            };
            if let Some(resp) = self.handle(&request) {
                let _ = writeln!(output, "{}", serde_json::to_string(&resp).unwrap_or_default());
                output.flush().map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
}

