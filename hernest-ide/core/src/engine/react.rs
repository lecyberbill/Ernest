use std::time::Instant;
use rusqlite::{params, Connection};
use serde_json::Value;

use crate::db::memories::MemoryService;
use crate::llm::client::ChatMessage;
use crate::llm::router::LLMRouter;
use crate::tools::fs::{read_file, write_file, edit_file};
use crate::tools::search::{grep_search, list_files};
use crate::tools::terminal::execute_terminal;
use crate::tools::web::{search_web, fetch_web_page};
use crate::tools::get_ide_tools_schemas;

pub struct ReActResult {
    pub run_id: String,
    pub status: String,
    pub answer: String,
    pub steps_count: usize,
    pub total_tokens: usize,
    pub duration_ms: u128,
}

pub struct ReActEngine<'a> {
    pub conn: &'a Connection,
    pub router: &'a LLMRouter,
    pub project_id: String,
    pub max_steps: usize,
}

impl<'a> ReActEngine<'a> {
    pub fn new(conn: &'a Connection, router: &'a LLMRouter, project_id: &str) -> Self {
        Self {
            conn,
            router,
            project_id: project_id.to_string(),
            max_steps: 8,
        }
    }

    fn record_trace(
        &self,
        run_id: &str,
        step_order: usize,
        step_type: &str,
        tool_name: Option<&str>,
        payload: &str,
    ) {
        self.conn.execute(
            "INSERT INTO run_traces (run_id, step_order, step_type, tool_name, payload) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![run_id, step_order as i64, step_type, tool_name, payload],
        ).ok();
    }

    fn dispatch_tool(&self, name: &str, args: &Value, run_id: &str) -> String {
        match name {
            "web_search" => {
                let query = args["query"].as_str().unwrap_or("");
                let max = args["max_results"].as_u64().unwrap_or(5) as usize;
                match search_web(query, max) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "web_fetch" => {
                let url = args["url"].as_str().unwrap_or("");
                let max = args["max_chars"].as_u64().unwrap_or(6000) as usize;
                match fetch_web_page(url, max) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "read_file" => {
                let path = args["path"].as_str().unwrap_or("");
                let start_line = args["start_line"].as_u64().map(|v| v as usize);
                let end_line = args["end_line"].as_u64().map(|v| v as usize);
                match read_file(path, start_line, end_line) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "edit_file" => {
                let path = args["path"].as_str().unwrap_or("");
                let target = args["target"].as_str().unwrap_or("");
                let replacement = args["replacement"].as_str().unwrap_or("");
                match edit_file(path, target, replacement) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "write_file" => {
                let path = args["path"].as_str().unwrap_or("");
                let content = args["content"].as_str().unwrap_or("");
                match write_file(path, content) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "grep_search" => {
                let query = args["query"].as_str().unwrap_or("");
                let root = args["root_path"].as_str().unwrap_or(".");
                let max = args["max_results"].as_u64().map(|v| v as usize);
                match grep_search(root, query, max) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "list_files" => {
                let root = args["root_path"].as_str().unwrap_or(".");
                let depth = args["max_depth"].as_u64().map(|v| v as usize);
                match list_files(root, depth) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "terminal_exec" => {
                let cmd = args["command"].as_str().unwrap_or("");
                let timeout = args["timeout_sec"].as_u64().unwrap_or(60);
                match execute_terminal(cmd, timeout) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "web_search" => {
                let q = args["query"].as_str().unwrap_or("");
                let max = args["max_results"].as_u64().unwrap_or(5) as usize;
                match search_web(q, max) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "store_memory" => {
                let key = args["key"].as_str().unwrap_or("");
                let content = args["content"].as_str().unwrap_or("");
                let scope = args["scope"].as_str().unwrap_or("project");
                let mem = MemoryService::new(self.conn);
                match mem.store_memory(&self.project_id, key, content, scope, None) {
                    Ok(msg) => serde_json::json!({"status": "success", "message": msg}).to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e.to_string()}).to_string(),
                }
            }
            "recall_memory" => {
                let key = args["key"].as_str().unwrap_or("");
                let mem = MemoryService::new(self.conn);
                match mem.recall_memory(&self.project_id, key, None) {
                    Ok(Some(val)) => serde_json::json!({"status": "success", "key": key, "content": val}).to_string(),
                    Ok(None) => serde_json::json!({"status": "not_found", "message": format!("Aucune mémoire pour '{}'", key)}).to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e.to_string()}).to_string(),
                }
            }
            "invoke_subagent" => {
                let role = args["role"].as_str().unwrap_or("Specialized Subagent");
                let task = args["task"].as_str().unwrap_or("");
                let readonly = args["readonly"].as_bool().unwrap_or(false);

                // Instanciation d'un sous-moteur ReAct dédié avec sandbox d'outils
                let sub_engine = SubAgentRunner {
                    conn: self.conn,
                    router: self.router,
                    project_id: format!("{}/sub_{}", self.project_id, &uuid::Uuid::new_v4().to_string().replace('-', "")[..6]),
                    role: role.to_string(),
                    readonly,
                    max_steps: 5,
                };

                match sub_engine.run(task) {
                    Ok(report) => serde_json::json!({
                        "status": "success",
                        "subagent_role": role,
                        "report": report
                    }).to_string(),
                    Err(e) => serde_json::json!({
                        "status": "error",
                        "subagent_role": role,
                        "error": e
                    }).to_string(),
                }
            }
            _ => serde_json::json!({"status": "error", "error": format!("Outil inconnu : {}", name)}).to_string(),
        }
    }

    pub fn run_with_callback<F>(&self, prompt: &str, mut on_trace: F) -> Result<ReActResult, String>
    where
        F: FnMut(&str, usize, &str, Option<&str>, &str, &str),
    {
        let start = Instant::now();
        let run_id = format!("run_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..12]);

        // Initialisation du run
        self.conn.execute(
            "INSERT INTO runs (id, project_id, prompt, provider, model, status, created_at) VALUES (?1, ?2, ?3, 'rust-native', 'hernest-ide-engine', 'running', CURRENT_TIMESTAMP)",
            params![run_id, self.project_id, prompt],
        ).map_err(|e| e.to_string())?;

        // Rappel automatique des mémoires du projet pour enrichir le contexte
        let mem = MemoryService::new(self.conn);
        let project_mems = mem.list_memories(&self.project_id).unwrap_or_default();
        let mut memory_context = String::new();
        if !project_mems.is_empty() {
            memory_context.push_str("\n\n[MÉMOIRES ET DÉCISIONS PERSISTÉES DU PROJET] :\n");
            for m in project_mems.iter().take(10) {
                memory_context.push_str(&format!("- {}: {}\n", m.key, m.content));
            }
        }

        let system_prompt = format!(
            "Tu es Hernest IDE, un ingénieur logiciel agentique d'élite (comparable à Claude Code et Antigravity) conçu pour coder en pair-programming direct. \
Tu résous les problèmes de programmation avec une rigueur absolue :
1. Lis d'abord le code source existant avec 'read_file' ou explore l'arborescence avec 'list_files' / 'grep_search' avant de modifier quoi que ce soit.
2. Pour modifier un fichier, utilise 'edit_file' avec le bloc 'target' exact (incluant espaces et sauts de ligne).
3. Utilise 'terminal_exec' pour lancer les builds, linters et tests unitaires (ex: 'cargo check', 'pytest', 'npm test').
4. Utilise 'web_search' si tu as besoin de vérifier une documentation d'API récente.
5. Utilise 'store_memory' pour retenir les choix d'architectures cruciaux ou règles de code afin de ne jamais les oublier.
Reste concis, précis et concentré sur l'excellence du code produit.{}",
            memory_context
        );

        let mut messages = vec![
            ChatMessage { role: "system".to_string(), content: system_prompt, images: None },
            ChatMessage { role: "user".to_string(), content: prompt.to_string(), images: None },
        ];

        let tools = get_ide_tools_schemas();
        let mut step_order = 1;
        let mut total_tokens = 0;
        let mut final_answer = String::new();
        let mut active_backend_name = String::from("rust-native");

        for _ in 0..self.max_steps {
            let (chat_res, active_backend) = self.router.chat_completion_with_fallback(&messages, Some(&tools))?;
            active_backend_name = active_backend;
            total_tokens += chat_res.total_tokens;

            if !chat_res.content.is_empty() {
                self.record_trace(&run_id, step_order, "thought", None, &chat_res.content);
                on_trace(&run_id, step_order, "thought", None, &chat_res.content, &active_backend_name);
                step_order += 1;
                messages.push(ChatMessage { role: "assistant".to_string(), content: chat_res.content.clone(), images: None });
            }

            // S'il n'y a aucun appel d'outil, nous sommes arrivés à la conclusion finale
            if chat_res.tool_calls.is_empty() {
                final_answer = chat_res.content;
                self.record_trace(&run_id, step_order, "answer", None, &final_answer);
                on_trace(&run_id, step_order, "answer", None, &final_answer, &active_backend_name);
                break;
            }

            // Exécution des outils demandés
            for call in chat_res.tool_calls {
                let fn_name = &call.name;
                let fn_args = &call.arguments;

                self.record_trace(&run_id, step_order, "tool_call", Some(fn_name), &fn_args.to_string());
                on_trace(&run_id, step_order, "tool_call", Some(fn_name), &fn_args.to_string(), &active_backend_name);
                step_order += 1;

                println!("  ⚡ [OUTIL RUST] {} {:?}", fn_name, fn_args);
                let tool_output = self.dispatch_tool(fn_name, fn_args, &run_id);

                self.record_trace(&run_id, step_order, "tool_output", Some(fn_name), &tool_output);
                on_trace(&run_id, step_order, "tool_output", Some(fn_name), &tool_output, &active_backend_name);
                step_order += 1;

                messages.push(ChatMessage {
                    role: "user".to_string(),
                    content: format!("Résultat de l'outil '{}' : {}", fn_name, tool_output),
                    images: None,
                });
            }
        }

        let duration_ms = start.elapsed().as_millis();

        self.conn.execute(
            "UPDATE runs SET status = 'success', completed_at = CURRENT_TIMESTAMP, duration_ms = ?1, total_tokens = ?2 WHERE id = ?3",
            params![duration_ms as i64, total_tokens as i64, run_id],
        ).ok();

        Ok(ReActResult {
            run_id,
            status: "success".to_string(),
            answer: final_answer,
            steps_count: step_order,
            total_tokens,
            duration_ms,
        })
    }

    pub fn run(&self, prompt: &str) -> Result<ReActResult, String> {
        self.run_with_callback(prompt, |_, _, _, _, _, _| {})
    }
}

pub struct SubAgentRunner<'a> {
    pub conn: &'a Connection,
    pub router: &'a LLMRouter,
    pub project_id: String,
    pub role: String,
    pub readonly: bool,
    pub max_steps: usize,
}

impl<'a> SubAgentRunner<'a> {
    fn dispatch_sub_tool(&self, name: &str, args: &Value) -> String {
        // En mode readonly, interdire l'écriture et l'exécution terminal
        if self.readonly && (name == "edit_file" || name == "write_file" || name == "terminal_exec") {
            return serde_json::json!({
                "status": "error",
                "error": format!("Outil '{}' interdit : ce sous-agent opère en mode lecture seule (read-only sandbox)", name)
            }).to_string();
        }

        match name {
            "read_file" => {
                let path = args["path"].as_str().unwrap_or("");
                let start_line = args["start_line"].as_u64().map(|v| v as usize);
                let end_line = args["end_line"].as_u64().map(|v| v as usize);
                match read_file(path, start_line, end_line) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "grep_search" => {
                let query = args["query"].as_str().unwrap_or("");
                let root = args["root_path"].as_str().unwrap_or(".");
                let max = args["max_results"].as_u64().map(|v| v as usize);
                match grep_search(root, query, max) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "list_files" => {
                let root = args["root_path"].as_str().unwrap_or(".");
                let depth = args["max_depth"].as_u64().map(|v| v as usize);
                match list_files(root, depth) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "web_search" => {
                let query = args["query"].as_str().unwrap_or("");
                let max = args["max_results"].as_u64().unwrap_or(5) as usize;
                match search_web(query, max) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "terminal_exec" => {
                let cmd = args["command"].as_str().unwrap_or("");
                let timeout = args["timeout_sec"].as_u64().unwrap_or(60);
                match execute_terminal(cmd, timeout) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            _ => serde_json::json!({"status": "error", "error": format!("Outil non supporté pour sous-agent : {}", name)}).to_string(),
        }
    }

    pub fn run(&self, mission: &str) -> Result<String, String> {
        let sub_run_id = format!("sub_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..10]);

        self.conn.execute(
            "INSERT INTO runs (id, project_id, prompt, provider, model, status, created_at) VALUES (?1, ?2, ?3, 'subagent', ?4, 'running', CURRENT_TIMESTAMP)",
            params![sub_run_id, self.project_id, mission, self.role],
        ).ok();

        let sys_prompt = format!(
            "Tu es un SOUS-AGENT spécialisé avec le rôle : '{}'. \
Tu es invoqué par l'agent coordinateur principal de Hernest IDE pour accomplir une mission ciblée. \
Mode sandbox : {}. \
Fouille, explore et synthétise tes résultats avec une extrême rigueur. \
Ta réponse finale DOIT être un rapport de synthèse ultra-clair, direct et concis (sans bavardage) répondant exactement à la mission.",
            self.role,
            if self.readonly { "LECTURE SEULE (seuls les outils de lecture/recherche sont autorisés)" } else { "STANDARD" }
        );

        let mut messages = vec![
            ChatMessage { role: "system".to_string(), content: sys_prompt, images: None },
            ChatMessage { role: "user".to_string(), content: mission.to_string(), images: None },
        ];

        let all_tools = get_ide_tools_schemas();
        // Filtrer les outils pour le sous-agent (pas de récursion infinie invoke_subagent)
        let sub_tools: Vec<Value> = all_tools.into_iter()
            .filter(|t| {
                let n = t["function"]["name"].as_str().unwrap_or("");
                n != "invoke_subagent" && (!self.readonly || (n != "edit_file" && n != "write_file" && n != "terminal_exec"))
            })
            .collect();

        let mut final_report = String::new();

        for _ in 0..self.max_steps {
            let (chat_res, _) = self.router.chat_completion_with_fallback(&messages, Some(&sub_tools))?;

            if chat_res.tool_calls.is_empty() {
                final_report = chat_res.content;
                break;
            }

            for call in chat_res.tool_calls {
                let fn_name = &call.name;
                let fn_args = &call.arguments;

                let output = self.dispatch_sub_tool(fn_name, fn_args);
                messages.push(ChatMessage {
                    role: "user".to_string(),
                    content: format!("Résultat de l'outil '{}' : {}", fn_name, output),
                    images: None,
                });
            }
        }

        self.conn.execute(
            "UPDATE runs SET status = 'success', completed_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![sub_run_id],
        ).ok();

        if final_report.is_empty() {
            final_report = "Mission accomplie sans synthèse textuelle explicite.".to_string();
        }

        Ok(final_report)
    }
}
