use std::time::Instant;
use rusqlite::{params, Connection};
use serde_json::Value;

use crate::db::memories::MemoryService;
use crate::llm::client::ChatMessage;
use crate::llm::router::LLMRouter;
use crate::tools::terminal::execute_terminal;
use crate::tools::artifacts::create_artifact;
use crate::tools::web::{search_web, fetch_web_page};
use crate::tools::get_primitive_tools_schemas;

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
            "terminal_exec" => {
                let cmd = args["command"].as_str().unwrap_or("");
                let timeout = args["timeout_sec"].as_u64().unwrap_or(30);
                match execute_terminal(cmd, timeout) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "create_artifact" => {
                let title = args["title"].as_str().unwrap_or("livrable");
                let content = args["content"].as_str().unwrap_or("");
                let a_type = args["artifact_type"].as_str().unwrap_or("markdown");
                let file_path = args["file_path"].as_str();
                match create_artifact(&self.project_id, title, content, a_type, file_path) {
                    Ok(res) => res.to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e}).to_string(),
                }
            }
            "store_memory" => {
                let key = args["key"].as_str().unwrap_or("");
                let content = args["content"].as_str().unwrap_or("");
                let scope = args["scope"].as_str().unwrap_or("project");
                let mem = MemoryService::new(self.conn);
                match mem.store_memory(&self.project_id, key, content, scope, Some(run_id)) {
                    Ok(msg) => serde_json::json!({"status": "ok", "message": msg}).to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e.to_string()}).to_string(),
                }
            }
            "recall_memory" => {
                let key = args["key"].as_str().unwrap_or("");
                let mem = MemoryService::new(self.conn);
                match mem.recall_memory(&self.project_id, key, Some(run_id)) {
                    Ok(val) => serde_json::json!({"key": key, "found": val.is_some(), "content": val}).to_string(),
                    Err(e) => serde_json::json!({"status": "error", "error": e.to_string()}).to_string(),
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
            "INSERT INTO runs (id, project_id, prompt, provider, model, status, created_at) VALUES (?1, ?2, ?3, 'rust-native', 'rust-react-engine', 'running', CURRENT_TIMESTAMP)",
            params![run_id, self.project_id, prompt],
        ).map_err(|e| e.to_string())?;

        let system_prompt = "Tu es Earnest, un système agentique autonome propulsé par un moteur Rust natif ultra-robuste. \
Tu résous la tâche pas à pas (ReAct). Tu disposes d'un accès complet à Internet et au web via 'web_search' (pour chercher sur le web) et 'web_fetch' (pour lire une page web). \
Utilise également les autres outils mis à disposition (terminal_exec, create_artifact, store_memory, recall_memory) quand nécessaire. \
N'hésite JAMAIS à utiliser 'web_search' quand l'utilisateur demande des informations récentes, des cotations, des recettes ou des données extérieures. \
Quand ta mission est accomplie, fournis directement ta réponse finale sans appel d'outil.";

        let mut messages = vec![
            ChatMessage { role: "system".to_string(), content: system_prompt.to_string(), images: None },
            ChatMessage { role: "user".to_string(), content: prompt.to_string(), images: None },
        ];

        let tools = get_primitive_tools_schemas();
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
