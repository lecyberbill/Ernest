pub mod assets;

use std::sync::Arc;
use std::thread;
use std::io::{Cursor, Read};
use std::path::Path;
use std::fs;
use tiny_http::{Server, Response, Header, Method};
use serde_json::Value;

use assets::Asset;
use crate::db::connection::{get_connection, init_db, get_data_dir};
use crate::db::memories::MemoryService;
use crate::llm::router::LLMRouter;
use crate::engine::react::ReActEngine;
use crate::tools::get_primitive_tools_schemas;

pub fn start_http_server(host: &str, port: u16) {
    let addr = format!("{}:{}", host, port);
    let server = Arc::new(Server::http(&addr).expect("Impossible de lier le serveur HTTP"));
    println!("🦀 Earnest Cockpit Natif Rust actif sur http://{}", addr);

    // Initialisation schéma SQLite
    init_db(None).ok();

    // Pool de threads pour requêtes concurrentes non-bloquantes
    for _ in 0..4 {
        let server = server.clone();
        thread::spawn(move || {
            for req in server.incoming_requests() {
                handle_request(req);
            }
        });
    }

    // Boucle d'attente principale
    loop {
        thread::park();
    }
}

fn parse_query(url: &str) -> (String, std::collections::HashMap<String, String>) {
    let mut parts = url.splitn(2, '?');
    let path = parts.next().unwrap_or("/").to_string();
    let mut map = std::collections::HashMap::new();
    if let Some(q) = parts.next() {
        for pair in q.split('&') {
            let mut kv = pair.splitn(2, '=');
            if let Some(k) = kv.next() {
                let v = kv.next().unwrap_or("");
                // Décodage minimal %xx
                let decoded_val = percent_decode(v);
                map.insert(k.to_string(), decoded_val);
            }
        }
    }
    (path, map)
}

fn percent_decode(s: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next().unwrap_or(b'0');
            let h2 = chars.next().unwrap_or(b'0');
            if let Ok(byte) = u8::from_str_radix(&format!("{}{}", h1 as char, h2 as char), 16) {
                bytes.push(byte);
            }
        } else if b == b'+' {
            bytes.push(b' ');
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn handle_request(mut req: tiny_http::Request) {
    let raw_url = req.url().to_string();
    let (path, query) = parse_query(&raw_url);

    let json_header = Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap();
    let cors_header = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();

    let method = req.method().clone();

    // ==========================================
    // 1. ENDPOINTS GET
    // ==========================================
    if method == Method::Get {
        if path == "/api/settings" {
            let conn = get_connection(None).unwrap();
            let mut map = serde_json::Map::new();
            if let Ok(mut stmt) = conn.prepare("SELECT key, value, is_secret FROM app_settings") {
                if let Ok(rows) = stmt.query_map([], |row| {
                    let k: String = row.get(0)?;
                    let v: String = row.get(1)?;
                    let is_sec: i32 = row.get(2)?;
                    Ok((k, v, is_sec))
                }) {
                    for r in rows.flatten() {
                        let val = if r.2 == 1 { "***".to_string() } else { r.1 };
                        map.insert(r.0, Value::String(val));
                    }
                }
            }
            let resp = Response::from_string(Value::Object(map).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/model_providers" {
            let conn = get_connection(None).unwrap();
            let mut list = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, name, provider_type, base_url, model, (api_key IS NOT NULL AND api_key != '') as has_key, is_enabled, priority, updated_at FROM model_providers ORDER BY priority ASC, created_at ASC") {
                if let Ok(rows) = stmt.query_map([], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "name": row.get::<_, String>(1)?,
                        "provider_type": row.get::<_, String>(2)?,
                        "base_url": row.get::<_, String>(3)?,
                        "model": row.get::<_, String>(4)?,
                        "has_key": row.get::<_, i32>(5)? == 1,
                        "is_enabled": row.get::<_, i32>(6)? == 1,
                        "priority": row.get::<_, i32>(7)?,
                        "updated_at": row.get::<_, Option<String>>(8)?.unwrap_or_default()
                    }))
                }) {
                    for r in rows.flatten() {
                        list.push(r);
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!(list).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/tools" {
            let mut tools = Vec::new();
            // Primitives système
            let primitives = get_primitive_tools_schemas();
            for p in primitives {
                let func = &p["function"];
                let name = func["name"].as_str().unwrap_or("");
                let desc = func["description"].as_str().unwrap_or("");
                let params = &func["parameters"];
                tools.push(serde_json::json!({
                    "id": format!("primitive_{}", name),
                    "name": name,
                    "description": desc,
                    "execution_type": "builtin",
                    "schema_json": params.to_string(),
                    "entrypoint": "earnest-core",
                    "is_enabled": 1,
                    "is_auto_generated": 0
                }));
            }
            // Outils personnalisés depuis DB
            if let Ok(conn) = get_connection(None) {
                if let Ok(mut stmt) = conn.prepare("SELECT id, name, description, schema_json, execution_type, entrypoint, is_enabled, is_auto_generated FROM tools WHERE is_enabled = 1") {
                    if let Ok(rows) = stmt.query_map([], |row| {
                        Ok(serde_json::json!({
                            "id": row.get::<_, String>(0)?,
                            "name": row.get::<_, String>(1)?,
                            "description": row.get::<_, String>(2)?,
                            "schema_json": row.get::<_, String>(3)?,
                            "execution_type": row.get::<_, String>(4)?,
                            "entrypoint": row.get::<_, String>(5)?,
                            "is_enabled": row.get::<_, i32>(6)?,
                            "is_auto_generated": row.get::<_, i32>(7)?
                        }))
                    }) {
                        for r in rows.flatten() {
                            tools.push(r);
                        }
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!(tools).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/mcp/servers" {
            let conn = get_connection(None).unwrap();
            let mut servers: Value = serde_json::json!([]);
            if let Ok(mut stmt) = conn.prepare("SELECT value FROM app_settings WHERE key = 'mcp_servers_config'") {
                if let Ok(val) = stmt.query_row([], |r| r.get::<_, String>(0)) {
                    servers = serde_json::from_str(&val).unwrap_or(serde_json::json!([]));
                }
            }
            let resp = Response::from_string(servers.to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/memories" {
            let conn = get_connection(None).unwrap();
            let proj_id = query.get("project_id").map(|s| s.as_str()).unwrap_or("default_workspace");
            let svc = MemoryService::new(&conn);
            let list = svc.list_memories(proj_id).unwrap_or_default();
            let resp = Response::from_string(serde_json::json!(list).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/chat/sessions" {
            let conn = get_connection(None).unwrap();
            let proj_id = query.get("project_id").map(|s| s.as_str()).unwrap_or("default_workspace");
            let mut list = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, title, project_id, created_at, updated_at FROM chat_sessions WHERE project_id = ? ORDER BY updated_at DESC") {
                if let Ok(rows) = stmt.query_map([proj_id], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "title": row.get::<_, String>(1)?,
                        "project_id": row.get::<_, String>(2)?,
                        "created_at": row.get::<_, String>(3)?,
                        "updated_at": row.get::<_, String>(4)?
                    }))
                }) {
                    for r in rows.flatten() {
                        list.push(r);
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!(list).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/chat/messages" {
            let conn = get_connection(None).unwrap();
            let session_id = query.get("session_id").map(|s| s.as_str()).unwrap_or("");
            let mut list = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, session_id, role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC") {
                if let Ok(rows) = stmt.query_map([session_id], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, i64>(0)?,
                        "session_id": row.get::<_, String>(1)?,
                        "role": row.get::<_, String>(2)?,
                        "content": row.get::<_, String>(3)?,
                        "created_at": row.get::<_, String>(4)?
                    }))
                }) {
                    for r in rows.flatten() {
                        list.push(r);
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!(list).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/artifacts" {
            let proj_id = query.get("project_id").map(|s| s.as_str()).unwrap_or("default_workspace");
            let art_dir = get_data_dir().join("artifacts").join(proj_id);
            let mut list = Vec::new();
            if art_dir.exists() {
                if let Ok(entries) = fs::read_dir(art_dir) {
                    for entry in entries.flatten() {
                        if let Ok(meta) = entry.metadata() {
                            if meta.is_file() {
                                let name = entry.file_name().to_string_lossy().to_string();
                                let path_str = entry.path().to_string_lossy().to_string();
                                let size_kb = (meta.len() as f64 / 1024.0 * 10.0).round() / 10.0;
                                let mtime = meta.modified()
                                    .ok()
                                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                    .map(|d| d.as_secs_f64())
                                    .unwrap_or(0.0);
                                list.push(serde_json::json!({
                                    "name": name,
                                    "path": path_str,
                                    "size_kb": size_kb,
                                    "modified_at": mtime
                                }));
                            }
                        }
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!(list).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/artifacts/content" {
            let file_path = query.get("path").map(|s| s.as_str()).unwrap_or("");
            let p = Path::new(file_path);
            if !p.exists() {
                let resp = Response::from_string(serde_json::json!({"error": "Fichier introuvable"}).to_string())
                    .with_status_code(404)
                    .with_header(json_header)
                    .with_header(cors_header);
                req.respond(resp).ok();
                return;
            }
            match fs::read_to_string(p) {
                Ok(content) => {
                    let resp = Response::from_string(serde_json::json!({
                        "content": content,
                        "path": file_path,
                        "name": p.file_name().and_then(|n| n.to_str()).unwrap_or("")
                    }).to_string())
                        .with_header(json_header)
                        .with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e.to_string()}).to_string())
                        .with_status_code(500)
                        .with_header(json_header)
                        .with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/tasks" {
            let conn = get_connection(None).unwrap();
            let proj_id = query.get("project_id").map(|s| s.as_str()).unwrap_or("default_workspace");
            let mut list = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, name, prompt, cron_expr, project_id, is_active, last_run_at, created_at FROM scheduled_tasks WHERE project_id = ?") {
                if let Ok(rows) = stmt.query_map([proj_id], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "name": row.get::<_, String>(1)?,
                        "prompt": row.get::<_, String>(2)?,
                        "cron_expr": row.get::<_, String>(3)?,
                        "project_id": row.get::<_, String>(4)?,
                        "is_active": row.get::<_, i32>(5)? == 1,
                        "last_run_at": row.get::<_, Option<String>>(6)?,
                        "created_at": row.get::<_, String>(7)?
                    }))
                }) {
                    for r in rows.flatten() {
                        list.push(r);
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!(list).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/runs" {
            let conn = get_connection(None).unwrap();
            let proj_id = query.get("project_id").map(|s| s.as_str()).unwrap_or("default_workspace");
            let mut runs = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, project_id, prompt, status, model, total_tokens, duration_ms, created_at FROM runs WHERE project_id = ? ORDER BY ROWID DESC LIMIT 50") {
                if let Ok(rows) = stmt.query_map([proj_id], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "project_id": row.get::<_, String>(1)?,
                        "prompt": row.get::<_, String>(2)?,
                        "status": row.get::<_, String>(3)?,
                        "model": row.get::<_, String>(4)?,
                        "total_tokens": row.get::<_, Option<i64>>(5)?.unwrap_or(0),
                        "duration_ms": row.get::<_, Option<i64>>(6)?.unwrap_or(0),
                        "created_at": row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                    }))
                }) {
                    for r in rows.flatten() {
                        runs.push(r);
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!(runs).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/run_details" {
            let conn = get_connection(None).unwrap();
            let run_id = query.get("run_id").map(|s| s.as_str()).unwrap_or("");
            let mut run_val: Option<Value> = None;
            if let Ok(mut stmt) = conn.prepare("SELECT id, project_id, prompt, status, model, total_tokens, duration_ms, created_at FROM runs WHERE id = ?") {
                if let Ok(mut rows) = stmt.query([run_id]) {
                    if let Ok(Some(row)) = rows.next() {
                        run_val = Some(serde_json::json!({
                            "id": row.get::<_, String>(0).unwrap_or_default(),
                            "project_id": row.get::<_, String>(1).unwrap_or_default(),
                            "prompt": row.get::<_, String>(2).unwrap_or_default(),
                            "status": row.get::<_, String>(3).unwrap_or_default(),
                            "model": row.get::<_, String>(4).unwrap_or_default(),
                            "total_tokens": row.get::<_, Option<i64>>(5).unwrap_or_default().unwrap_or(0),
                            "duration_ms": row.get::<_, Option<i64>>(6).unwrap_or_default().unwrap_or(0),
                            "created_at": row.get::<_, Option<String>>(7).unwrap_or_default().unwrap_or_default(),
                        }));
                    }
                }
            }
            let mut traces = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT step_order, step_type, tool_name, payload, created_at FROM run_traces WHERE run_id = ? ORDER BY step_order ASC") {
                if let Ok(rows) = stmt.query_map([run_id], |row| {
                    Ok(serde_json::json!({
                        "step_order": row.get::<_, i64>(0)?,
                        "step_type": row.get::<_, String>(1)?,
                        "tool_name": row.get::<_, Option<String>>(2)?,
                        "payload": row.get::<_, Option<String>>(3)?,
                        "created_at": row.get::<_, String>(4)?
                    }))
                }) {
                    for t in rows.flatten() {
                        traces.push(t);
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!({
                "run": run_val,
                "traces": traces
            }).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/backups" {
            let backup_dir = get_data_dir().join("backups");
            let mut list = Vec::new();
            if backup_dir.exists() {
                if let Ok(entries) = fs::read_dir(backup_dir) {
                    for e in entries.flatten() {
                        if let Ok(meta) = e.metadata() {
                            let fname = e.file_name().to_string_lossy().to_string();
                            let fpath = e.path().to_string_lossy().to_string();
                            let size_kb = (meta.len() as f64 / 1024.0 * 10.0).round() / 10.0;
                            let created_at = meta.modified()
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs_f64())
                                .unwrap_or(0.0);
                            list.push(serde_json::json!({
                                "filename": fname,
                                "path": fpath,
                                "size_kb": size_kb,
                                "created_at": created_at
                            }));
                        }
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!(list).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/evals/history" {
            let conn = get_connection(None).unwrap();
            let mut list = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, scenario_id, category, backend, model, status, score, duration_ms, steps_count, total_tokens, tools_used, details, created_at FROM benchmark_eval_runs ORDER BY id DESC LIMIT 50") {
                if let Ok(rows) = stmt.query_map([], |row| {
                    let raw_tools: Option<String> = row.get(10)?;
                    let tools_val: Value = raw_tools.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::json!([]));
                    let raw_det: Option<String> = row.get(11)?;
                    let det_val: Value = raw_det.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(serde_json::json!({}));
                    Ok(serde_json::json!({
                        "id": row.get::<_, i64>(0)?,
                        "scenario_id": row.get::<_, String>(1)?,
                        "category": row.get::<_, String>(2)?,
                        "backend": row.get::<_, String>(3)?,
                        "model": row.get::<_, String>(4)?,
                        "status": row.get::<_, String>(5)?,
                        "score": row.get::<_, f64>(6)?,
                        "duration_ms": row.get::<_, i64>(7)?,
                        "steps_count": row.get::<_, i64>(8)?,
                        "total_tokens": row.get::<_, i64>(9)?,
                        "tools_used": tools_val,
                        "details": det_val,
                        "created_at": row.get::<_, String>(12)?
                    }))
                }) {
                    for r in rows.flatten() {
                        list.push(r);
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!(list).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/telemetry" {
            let conn = get_connection(None).unwrap();
            let total_runs: i64 = conn.query_row("SELECT COUNT(*) FROM runs", [], |r| r.get(0)).unwrap_or(0);
            let success_runs: i64 = conn.query_row("SELECT COUNT(*) FROM runs WHERE status = 'success'", [], |r| r.get(0)).unwrap_or(0);
            let total_mem: i64 = conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0)).unwrap_or(0);
            let total_tools: i64 = conn.query_row("SELECT COUNT(*) FROM tools WHERE is_enabled = 1", [], |r| r.get(0)).unwrap_or(0);

            let router = LLMRouter::from_db(&conn);
            let probes = router.probe_all();

            let json = serde_json::json!({
                "total_runs": total_runs,
                "success_runs": success_runs,
                "total_memories": total_mem,
                "active_tools": total_tools + 6,
                "backends": probes,
                "gpu_target": "Moteur Rust Natif Déployé",
                "current_model": "qwen3.8:27b"
            });

            let resp = Response::from_string(json.to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }
    }

    // ==========================================
    // 2. ENDPOINTS POST
    // ==========================================
    if method == Method::Post {
        let mut body_str = String::new();
        req.as_reader().read_to_string(&mut body_str).ok();
        let body: Value = serde_json::from_str(&body_str).unwrap_or(serde_json::json!({}));

        if path == "/api/settings" {
            let conn = get_connection(None).unwrap();
            if let Some(obj) = body.as_object() {
                for (k, v) in obj {
                    let str_val = v.as_str().map(|s| s.to_string()).unwrap_or_else(|| v.to_string());
                    let is_sec = if k.to_lowercase().contains("key") || k.to_lowercase().contains("secret") || k.to_lowercase().contains("token") { 1 } else { 0 };
                    conn.execute(
                        "INSERT INTO app_settings (key, value, is_secret, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                        rusqlite::params![k, str_val, is_sec],
                    ).ok();
                }
            }
            let resp = Response::from_string(serde_json::json!({"status": "ok"}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/model_providers" {
            let conn = get_connection(None).unwrap();
            let p_id = body["id"].as_str().map(|s| s.to_string()).unwrap_or_else(|| format!("provider_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..8]));
            let name = body["name"].as_str().unwrap_or("Nouveau Modèle");
            let provider_type = body["provider_type"].as_str().unwrap_or("openai");
            let base_url = body["base_url"].as_str().unwrap_or("http://127.0.0.1:1234").trim_end_matches('/');
            let model = body["model"].as_str().unwrap_or("default");
            let raw_key = body["api_key"].as_str();
            let is_enabled = if body["is_enabled"].as_bool().unwrap_or(true) { 1 } else { 0 };

            conn.execute(
                "INSERT INTO model_providers (id, name, provider_type, base_url, model, api_key, is_enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name=excluded.name, provider_type=excluded.provider_type, base_url=excluded.base_url, model=excluded.model, api_key=COALESCE(excluded.api_key, model_providers.api_key), is_enabled=excluded.is_enabled, updated_at=CURRENT_TIMESTAMP",
                rusqlite::params![p_id, name, provider_type, base_url, model, raw_key, is_enabled],
            ).ok();

            let resp = Response::from_string(serde_json::json!({"status": "saved", "id": p_id}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/model_providers/toggle" {
            let conn = get_connection(None).unwrap();
            let p_id = body["id"].as_str().unwrap_or("");
            let mut new_val = 1;
            if let Ok(curr) = conn.query_row("SELECT is_enabled FROM model_providers WHERE id = ?", [p_id], |r| r.get::<_, i32>(0)) {
                new_val = if curr == 1 { 0 } else { 1 };
                conn.execute("UPDATE model_providers SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", rusqlite::params![new_val, p_id]).ok();
            }
            let resp = Response::from_string(serde_json::json!({"status": "updated", "id": p_id, "is_enabled": new_val == 1}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/model_providers/delete" {
            let conn = get_connection(None).unwrap();
            let p_id = body["id"].as_str().unwrap_or("");
            conn.execute("DELETE FROM model_providers WHERE id = ?", [p_id]).ok();
            let resp = Response::from_string(serde_json::json!({"status": "deleted", "id": p_id}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/artifacts/save" {
            let file_path = body["path"].as_str().unwrap_or("");
            let content = body["content"].as_str().unwrap_or("");
            let p = Path::new(file_path);
            if let Some(parent) = p.parent() {
                fs::create_dir_all(parent).ok();
            }
            match fs::write(p, content) {
                Ok(_) => {
                    let size_kb = (content.len() as f64 / 1024.0 * 10.0).round() / 10.0;
                    let resp = Response::from_string(serde_json::json!({"status": "saved", "path": file_path, "size_kb": size_kb}).to_string())
                        .with_header(json_header)
                        .with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e.to_string()}).to_string())
                        .with_status_code(500)
                        .with_header(json_header)
                        .with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/artifacts/delete" {
            let file_path = body["path"].as_str().unwrap_or("");
            let p = Path::new(file_path);
            if p.exists() {
                fs::remove_file(p).ok();
            }
            let resp = Response::from_string(serde_json::json!({"status": "deleted", "path": file_path}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/mcp/servers" {
            let conn = get_connection(None).unwrap();
            let servers = &body["servers"];
            let json_str = servers.to_string();
            conn.execute(
                "INSERT INTO app_settings (key, value, is_secret, updated_at) VALUES ('mcp_servers_config', ?, 0, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                [&json_str],
            ).ok();
            let resp = Response::from_string(serde_json::json!({"status": "ok"}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/memories" {
            let conn = get_connection(None).unwrap();
            let svc = MemoryService::new(&conn);
            let proj_id = body["project_id"].as_str().unwrap_or("default_workspace");
            let key = body["key"].as_str().unwrap_or("");
            let content = body["content"].as_str().unwrap_or("");
            let scope = body["scope"].as_str().unwrap_or("project");
            let res = svc.store_memory(proj_id, key, content, scope, None);
            let resp = match res {
                Ok(id) => Response::from_string(serde_json::json!({"status": "stored", "id": id}).to_string()),
                Err(e) => Response::from_string(serde_json::json!({"error": e.to_string()}).to_string()).with_status_code(500),
            };
            req.respond(resp.with_header(json_header).with_header(cors_header)).ok();
            return;
        }

        if path == "/api/tasks" {
            let conn = get_connection(None).unwrap();
            let task_id = body["id"].as_str().map(|s| s.to_string()).unwrap_or_else(|| format!("task_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..8]));
            let name = body["name"].as_str().unwrap_or("");
            let prompt = body["prompt"].as_str().unwrap_or("");
            let cron_expr = body["cron_expr"].as_str().unwrap_or("");
            let proj_id = body["project_id"].as_str().unwrap_or("default_workspace");

            conn.execute(
                "INSERT INTO scheduled_tasks (id, name, prompt, cron_expr, project_id) VALUES (?, ?, ?, ?, ?)",
                rusqlite::params![task_id, name, prompt, cron_expr, proj_id],
            ).ok();

            let resp = Response::from_string(serde_json::json!({"status": "ok", "task_id": task_id}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/chat" {
            let conn = get_connection(None).unwrap();
            let messages = body["messages"].as_array();
            let mut session_id = body["session_id"].as_str().map(|s| s.to_string()).unwrap_or_default();
            let proj_id = body["project_id"].as_str().unwrap_or("default_workspace");

            if session_id.is_empty() {
                session_id = format!("chat_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..8]);
                let title = messages
                    .and_then(|m| m.first())
                    .and_then(|f| f["content"].as_str())
                    .unwrap_or("Nouvelle conversation");
                let preview = if title.len() > 40 { &title[..40] } else { title };
                conn.execute(
                    "INSERT INTO chat_sessions (id, title, project_id) VALUES (?, ?, ?)",
                    rusqlite::params![session_id, preview, proj_id],
                ).ok();
            }

            // Persister le message utilisateur
            if let Some(m_arr) = messages {
                if let Some(last) = m_arr.last() {
                    if last["role"].as_str() == Some("user") {
                        let c = last["content"].as_str().unwrap_or("");
                        conn.execute(
                            "INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'user', ?)",
                            rusqlite::params![session_id, c],
                        ).ok();
                    }
                }
            }

            let router = LLMRouter::from_db(&conn);
            let mut req_msgs = Vec::new();
            if let Some(m_arr) = messages {
                for m in m_arr {
                    req_msgs.push(crate::llm::client::ChatMessage {
                        role: m["role"].as_str().unwrap_or("user").to_string(),
                        content: m["content"].as_str().unwrap_or("").to_string(),
                        images: None,
                    });
                }
            }

            match router.chat_completion_with_fallback(&req_msgs, None) {
                Ok((res, backend_id)) => {
                    let assistant_content = res.content;
                    conn.execute(
                        "INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'assistant', ?)",
                        rusqlite::params![session_id, assistant_content],
                    ).ok();
                    conn.execute(
                        "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        rusqlite::params![session_id],
                    ).ok();

                    let resp = Response::from_string(serde_json::json!({
                        "content": assistant_content,
                        "session_id": session_id,
                        "backend": backend_id
                    }).to_string())
                        .with_header(json_header)
                        .with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string())
                        .with_status_code(500)
                        .with_header(json_header)
                        .with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/run/stream" {
            let prompt = body["prompt"].as_str().unwrap_or("").to_string();
            let project_id = body["project_id"].as_str().unwrap_or("default_workspace").to_string();

            let conn = get_connection(None).unwrap();
            let router = LLMRouter::from_db(&conn);
            let engine = ReActEngine::new(&conn, &router, &project_id);

            let mut sse_events = Vec::new();
            sse_events.push(format!("event: init\ndata: {}\n\n", serde_json::json!({
                "run_id": "run_starting",
                "backend": "rust-native",
                "reason": "Moteur Rust Natif Déployé"
            })));

            let res = engine.run_with_callback(&prompt, |_run_id, step_order, step_type, tool_name, payload, backend| {
                let trace_obj = serde_json::json!({
                    "step_order": step_order,
                    "step_type": step_type,
                    "tool_name": tool_name,
                    "payload": payload,
                    "active_backend": backend,
                    "timestamp": ""
                });
                sse_events.push(format!("event: trace\ndata: {}\n\n", trace_obj));
            });

            match res {
                Ok(r) => {
                    sse_events.push(format!("event: completed\ndata: {}\n\n", serde_json::json!({
                        "run_id": r.run_id,
                        "status": "success",
                        "answer": r.answer,
                        "usage": {
                            "total_tokens": r.total_tokens,
                            "duration_ms": r.duration_ms
                        },
                        "backend": "rust-native"
                    })));
                }
                Err(e) => {
                    sse_events.push(format!("event: error\ndata: {}\n\n", serde_json::json!({
                        "error": e
                    })));
                }
            }

            let full_stream = sse_events.join("");
            let sse_header = Header::from_bytes(&b"Content-Type"[..], &b"text/event-stream; charset=utf-8"[..]).unwrap();
            let cache_header = Header::from_bytes(&b"Cache-Control"[..], &b"no-cache"[..]).unwrap();
            let resp = Response::from_string(full_stream)
                .with_header(sse_header)
                .with_header(cache_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/run" {
            let prompt = body["prompt"].as_str().unwrap_or("");
            let project_id = body["project_id"].as_str().unwrap_or("default_workspace");

            let conn = get_connection(None).unwrap();
            let router = LLMRouter::from_db(&conn);
            let engine = ReActEngine::new(&conn, &router, project_id);

            match engine.run(prompt) {
                Ok(res) => {
                    let json = serde_json::json!({
                        "status": "success",
                        "run_id": res.run_id,
                        "answer": res.answer,
                        "steps_count": res.steps_count,
                        "total_tokens": res.total_tokens,
                        "duration_ms": res.duration_ms
                    });
                    let resp = Response::from_string(json.to_string())
                        .with_header(json_header)
                        .with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let json = serde_json::json!({"status": "error", "error": e});
                    let resp = Response::from_string(json.to_string())
                        .with_status_code(500)
                        .with_header(json_header)
                        .with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        // Endpoint générique OK pour les actions HITL / Abort
        if path == "/api/run/abort" || path == "/api/run/approve" {
            let resp = Response::from_string(serde_json::json!({"status": "ok"}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }
    }

    // ==========================================
    // 3. FICHIERS STATIQUES EMBARQUÉS (rust-embed)
    // ==========================================
    let asset_path = if path == "/" || path.is_empty() {
        "index.html"
    } else {
        path.trim_start_matches('/')
    };

    match Asset::get(asset_path) {
        Some(content) => {
            let mime = if asset_path.ends_with(".html") {
                "text/html; charset=utf-8"
            } else if asset_path.ends_with(".css") {
                "text/css; charset=utf-8"
            } else if asset_path.ends_with(".js") {
                "application/javascript; charset=utf-8"
            } else if asset_path.ends_with(".svg") {
                "image/svg+xml"
            } else if asset_path.ends_with(".png") {
                "image/png"
            } else {
                "application/octet-stream"
            };

            let header = Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap();
            let data: Vec<u8> = content.data.into_owned();
            let len = data.len();
            let resp = Response::empty(200)
                .with_data(Cursor::new(data), Some(len))
                .with_header(header)
                .with_header(cors_header);
            req.respond(resp).ok();
        }
        None => {
            let resp = Response::from_string(serde_json::json!({"error": "404 Not Found", "path": path}).to_string())
                .with_status_code(404)
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
        }
    }
}
