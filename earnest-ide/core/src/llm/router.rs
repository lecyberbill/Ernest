use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use super::client::{ChatMessage, ChatResponse, LLMClient};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendConfig {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub is_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProbeResult {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub model: String,
    pub is_online: bool,
    pub latency_ms: Option<u128>,
    pub error: Option<String>,
}

pub struct LLMRouter {
    pub backends: Vec<BackendConfig>,
}

impl LLMRouter {
    pub fn from_db(conn: &Connection) -> Self {
        let mut backends = Vec::new();
        if let Ok(mut stmt) = conn.prepare("SELECT id, name, provider_type, base_url, model, api_key, is_enabled FROM model_providers ORDER BY priority ASC, created_at ASC") {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok(BackendConfig {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    provider_type: row.get(2)?,
                    base_url: row.get(3)?,
                    model: row.get(4)?,
                    api_key: row.get(5)?,
                    is_enabled: row.get::<_, i64>(6)? != 0,
                })
            }) {
                for r in rows.flatten() {
                    if r.is_enabled {
                        backends.push(r);
                    }
                }
            }
        }

        if backends.is_empty() {
            // Fallbacks
            backends.push(BackendConfig {
                id: "ollama".to_string(),
                name: "Ollama Local".to_string(),
                provider_type: "ollama".to_string(),
                base_url: "http://192.168.1.165:11434".to_string(),
                model: "qwen3.8:27b".to_string(),
                api_key: None,
                is_enabled: true,
            });
            backends.push(BackendConfig {
                id: "lmstudio".to_string(),
                name: "LM Studio".to_string(),
                provider_type: "openai".to_string(),
                base_url: "http://127.0.0.1:1234".to_string(),
                model: "local-model".to_string(),
                api_key: None,
                is_enabled: true,
            });
        }

        Self { backends }
    }

    pub fn probe_all(&self) -> Vec<ProbeResult> {
        self.backends.iter().map(|b| {
            let client = LLMClient::new(&b.provider_type, &b.base_url, &b.model, b.api_key.clone());
            match client.ping() {
                Ok(ms) => ProbeResult {
                    id: b.id.clone(),
                    name: b.name.clone(),
                    provider_type: b.provider_type.clone(),
                    model: b.model.clone(),
                    is_online: true,
                    latency_ms: Some(ms),
                    error: None,
                },
                Err(err) => ProbeResult {
                    id: b.id.clone(),
                    name: b.name.clone(),
                    provider_type: b.provider_type.clone(),
                    model: b.model.clone(),
                    is_online: false,
                    latency_ms: None,
                    error: Some(err),
                },
            }
        }).collect()
    }

    pub fn chat_completion_with_fallback(
        &self,
        messages: &[ChatMessage],
        tools: Option<&[serde_json::Value]>,
    ) -> Result<(ChatResponse, String), String> {
        let mut last_err = String::from("Aucun moteur configuré");

        for b in &self.backends {
            let client = LLMClient::new(&b.provider_type, &b.base_url, &b.model, b.api_key.clone());
            
            // Circuit Breaker & Exponential Retry (jusqu'à 3 tentatives par backend)
            let mut attempts = 0;
            let max_retries = 2;
            let mut backoff_ms = 400;

            loop {
                match client.chat_completion(messages, tools) {
                    Ok(resp) => return Ok((resp, b.id.clone())),
                    Err(e) => {
                        attempts += 1;
                        last_err = format!("Moteur {} (tentative {}/{}) échoué: {}", b.name, attempts, max_retries + 1, e);
                        if attempts > max_retries {
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(backoff_ms));
                        backoff_ms *= 2;
                    }
                }
            }
        }

        Err(format!("Tous les moteurs LLM ont échoué. Dernière erreur: {}", last_err))
    }
}

