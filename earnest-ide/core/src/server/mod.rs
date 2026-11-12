pub mod assets;

use std::sync::Arc;
use std::thread;
use std::path::PathBuf;
use std::fs;
use tiny_http::{Server, Response, Header, Method};
use serde_json::Value;

use assets::Asset;
use crate::db::connection::{get_connection, init_db};
use crate::db::memories::MemoryService;
use crate::llm::router::LLMRouter;
use crate::engine::react::ReActEngine;
use crate::tools::get_ide_tools_schemas;
use crate::tools::fs::{write_file, rename_file_or_dir, delete_file_or_dir, create_directory};
use crate::tools::search::{grep_search, list_files, list_directory_entries};
use crate::tools::terminal::execute_terminal;
use crate::tools::git::{get_git_status, get_git_diff, git_commit};
use crate::tools::diagnostics::run_project_diagnostics;

pub fn start_http_server(host: &str, port: u16) {
    let addr = format!("{}:{}", host, port);
    let server = Arc::new(Server::http(&addr).expect("Impossible de lier le serveur Earnest IDE"));
    println!("🦀 Earnest IDE Server actif sur http://{}", addr);

    init_db(None).ok();

    for _ in 0..4 {
        let server = server.clone();
        thread::spawn(move || {
            for req in server.incoming_requests() {
                handle_request(req);
            }
        });
    }

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
                map.insert(k.to_string(), url_decode(v));
            }
        }
    }
    (path, map)
}

fn url_decode(s: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            if let (Some(h1), Some(h2)) = (chars.next(), chars.next()) {
                if let Ok(val) = u8::from_str_radix(&format!("{}{}", h1 as char, h2 as char), 16) {
                    bytes.push(val);
                }
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
    let cors_methods = Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..]).unwrap();
    let cors_headers = Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap();

    let method = req.method().clone();

    if method == Method::Options {
        let resp = Response::empty(204)
            .with_header(cors_header)
            .with_header(cors_methods)
            .with_header(cors_headers);
        req.respond(resp).ok();
        return;
    }

    // 1. ENDPOINTS GET
    if method == Method::Get {
        if path == "/api/ide/tree" {
            let root = query.get("root").map(|s| s.as_str()).unwrap_or(".");
            match list_directory_entries(root) {
                Ok(val) => {
                    let resp = Response::from_string(val.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/all_files" {
            let root = query.get("root").map(|s| s.as_str()).unwrap_or(".");
            match list_files(root, Some(8)) {
                Ok(val) => {
                    let resp = Response::from_string(val.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/git/status" {
            let root = query.get("root").map(|s| s.as_str()).unwrap_or(".");
            match get_git_status(root) {
                Ok(val) => {
                    let resp = Response::from_string(val.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/git/diff" {
            let root = query.get("root").map(|s| s.as_str()).unwrap_or(".");
            let file = query.get("file").map(|s| s.as_str());
            match get_git_diff(root, file) {
                Ok(val) => {
                    let resp = Response::from_string(val.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/diagnostics" {
            let root = query.get("root").map(|s| s.as_str()).unwrap_or(".");
            match run_project_diagnostics(root) {
                Ok(val) => {
                    let resp = Response::from_string(val.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/file" {
            let file_path = query.get("path").map(|s| s.as_str()).unwrap_or("");
            let p = std::path::Path::new(file_path);
            if let Ok(metadata) = std::fs::metadata(p) {
                // Plafond de 10 Mo pour éviter de saturer la mémoire du navigateur sur gros binaires/fichiers
                if metadata.len() > 10 * 1024 * 1024 {
                    let resp = Response::from_string(serde_json::json!({
                        "error": format!("Fichier trop volumineux ({:.2} Mo). La limite d'édition directe est de 10 Mo.", metadata.len() as f64 / 1_048_576.0)
                    }).to_string()).with_status_code(413).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                    return;
                }
            }
            match std::fs::read_to_string(file_path) {
                Ok(content) => {
                    let mtime = std::fs::metadata(file_path).and_then(|m| m.modified()).map(|t| {
                        t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
                    }).unwrap_or(0);
                    let resp = Response::from_string(serde_json::json!({"path": file_path, "content": content, "mtime": mtime}).to_string())
                        .with_header(json_header)
                        .with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e.to_string()}).to_string())
                        .with_status_code(404)
                        .with_header(json_header)
                        .with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/file/status" {
            let file_path = query.get("path").map(|s| s.as_str()).unwrap_or("");
            if file_path.is_empty() {
                let resp = Response::from_string(serde_json::json!({"error": "path manquant"}).to_string())
                    .with_status_code(400)
                    .with_header(json_header)
                    .with_header(cors_header);
                req.respond(resp).ok();
                return;
            }

            let mtime = std::fs::metadata(file_path).and_then(|m| m.modified()).map(|t| {
                t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
            }).unwrap_or(0);

            let resp = Response::from_string(serde_json::json!({
                "path": file_path,
                "exists": std::path::Path::new(file_path).exists(),
                "mtime": mtime
            }).to_string())
            .with_header(json_header)
            .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/tools" {
            let tools = get_ide_tools_schemas();
            let resp = Response::from_string(serde_json::json!(tools).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/models" || path == "/api/model_providers" {
            let conn = get_connection(None).unwrap();
            let mut list = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, name, provider_type, base_url, model, (api_key IS NOT NULL AND api_key != '') as has_key, is_enabled, priority FROM model_providers ORDER BY priority ASC, created_at ASC") {
                if let Ok(rows) = stmt.query_map([], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "name": row.get::<_, String>(1)?,
                        "provider_type": row.get::<_, String>(2)?,
                        "base_url": row.get::<_, String>(3)?,
                        "model": row.get::<_, String>(4)?,
                        "has_key": row.get::<_, i32>(5)? == 1,
                        "is_enabled": row.get::<_, i32>(6)? == 1,
                        "priority": row.get::<_, i32>(7)?
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

        if path == "/api/settings" {
            let conn = get_connection(None).unwrap();
            let mut settings = serde_json::Map::new();
            if let Ok(mut stmt) = conn.prepare("SELECT key, value, is_secret FROM app_settings") {
                if let Ok(rows) = stmt.query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i32>(2)? == 1))
                }) {
                    for r in rows.flatten() {
                        let (k, v, is_secret) = r;
                        settings.insert(k, serde_json::json!(if is_secret { "***" } else { &v }));
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!(settings).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/mcp/servers" {
            let conn = get_connection(None).unwrap();
            let servers_json = conn.query_row("SELECT value FROM app_settings WHERE key = 'mcp_servers_config'", [], |r| r.get::<_, String>(0))
                .unwrap_or_else(|_| "[]".to_string());
            let servers: Value = serde_json::from_str(&servers_json).unwrap_or_else(|_| serde_json::json!([]));
            let resp = Response::from_string(servers.to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/memories" {
            let conn = get_connection(None).unwrap();
            let project = query.get("project").map(|s| s.as_str()).unwrap_or("earnest_ide");
            let mem = MemoryService::new(&conn);
            let items = mem.list_memories(project).unwrap_or_default();
            let resp = Response::from_string(serde_json::json!(items).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/history" {
            let conn = get_connection(None).unwrap();
            let project = query.get("project").map(|s| s.as_str()).unwrap_or("earnest_ide");
            let mut list = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, prompt, status, model, total_tokens, duration_ms, created_at FROM runs WHERE project_id = ? ORDER BY id DESC LIMIT 20") {
                if let Ok(rows) = stmt.query_map([project], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "prompt": row.get::<_, String>(1)?,
                        "status": row.get::<_, String>(2)?,
                        "model": row.get::<_, String>(3)?,
                        "total_tokens": row.get::<_, Option<i64>>(4)?.unwrap_or(0),
                        "duration_ms": row.get::<_, Option<i64>>(5)?.unwrap_or(0),
                        "created_at": row.get::<_, Option<String>>(6)?.unwrap_or_default()
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

        if path == "/api/ide/run_detail" {
            let conn = get_connection(None).unwrap();
            let run_id = query.get("run_id").map(|s| s.as_str()).unwrap_or("");
            let mut traces = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT step_order, step_type, tool_name, payload, created_at FROM run_traces WHERE run_id = ? ORDER BY step_order ASC") {
                if let Ok(rows) = stmt.query_map([run_id], |row| {
                    Ok(serde_json::json!({
                        "step_order": row.get::<_, i64>(0)?,
                        "step_type": row.get::<_, String>(1)?,
                        "tool_name": row.get::<_, Option<String>>(2)?,
                        "payload": row.get::<_, String>(3)?,
                        "created_at": row.get::<_, Option<String>>(4)?.unwrap_or_default()
                    }))
                }) {
                    for r in rows.flatten() {
                        traces.push(r);
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!({
                "run_id": run_id,
                "traces": traces
            }).to_string())
            .with_header(json_header)
            .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/projects" {
            let conn = get_connection(None).unwrap();
            let mut list = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, name, root_path, description, created_at, updated_at FROM projects ORDER BY updated_at DESC") {
                if let Ok(rows) = stmt.query_map([], |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "name": row.get::<_, String>(1)?,
                        "root_path": row.get::<_, String>(2)?,
                        "description": row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                        "created_at": row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                        "updated_at": row.get::<_, Option<String>>(5)?.unwrap_or_default()
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

        if path == "/api/ide/settings" {
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

        // --- GOUVERNANCE PAR INVARIANTS : ENDPOINT STATUS ---
        if path == "/api/ide/governance/status" {
            let root_str = query.get("root").map(|s| s.as_str()).unwrap_or(".");
            let root_path = PathBuf::from(root_str);
            let pm = crate::governance::PolicyManager::new(&root_path);
            let policy = pm.load_or_init(None).unwrap_or_default();

            let inv_candidates = vec![
                root_path.join(&policy.invariants_file),
                PathBuf::from(&policy.invariants_file),
                PathBuf::from(".ide/invariants.json"),
                PathBuf::from("../../.ide/invariants.json"),
                PathBuf::from("invariants.json"),
            ];

            let inv_path = inv_candidates.into_iter().find(|p| p.exists())
                .unwrap_or_else(|| root_path.join(&policy.invariants_file));

            let lock_candidates = vec![
                root_path.join(&policy.lock_file),
                PathBuf::from(&policy.lock_file),
                PathBuf::from(".ide/invariants.lock"),
                PathBuf::from("../../.ide/invariants.lock"),
                PathBuf::from("invariants.lock"),
            ];

            let lock_path = lock_candidates.into_iter().find(|p| p.exists())
                .unwrap_or_else(|| root_path.join(&policy.lock_file));

            let lock_exists = lock_path.exists();
            let inv_exists = inv_path.exists();

            let integrity_status = if inv_exists && lock_exists {
                match crate::governance::invariants::verify_invariants_lock(&root_path, &policy.invariants_file, &policy.lock_file) {
                    Ok(hash) => serde_json::json!({"status": "verified", "sha256": hash}),
                    Err(e) => serde_json::json!({"status": "corrupted", "error": e}),
                }
            } else {
                serde_json::json!({"status": "unsealed", "message": "Invariants non scellés ou fichiers absents"})
            };

            let contracts_summary = if inv_exists {
                if let Ok(c) = fs::read_to_string(&inv_path) {
                    let f: Result<crate::governance::InvariantsFile, _> = serde_json::from_str(&c);
                    f.map(|file| serde_json::json!({
                        "count": file.contracts.len(),
                        "contracts": file.contracts.iter().map(|item| serde_json::json!({
                            "id": item.id,
                            "target_file": item.target_file,
                            "criticality": item.criticality,
                            "probes_count": item.probes.len()
                        })).collect::<Vec<_>>()
                    })).unwrap_or_else(|_| {
                        // Fallback si structure standard invariants
                        let val: Result<Value, _> = serde_json::from_str(&c);
                        if let Ok(v) = val {
                            let list = v.get("invariants").and_then(|arr| arr.as_array()).cloned().unwrap_or_default();
                            serde_json::json!({
                                "count": list.len(),
                                "contracts": list.iter().map(|item| serde_json::json!({
                                    "id": item.get("id").and_then(|s| s.as_str()).unwrap_or(""),
                                    "target_file": item.get("component").and_then(|s| s.as_str()).unwrap_or(""),
                                    "criticality": "high",
                                    "probes_count": 1
                                })).collect::<Vec<_>>()
                            })
                        } else {
                            serde_json::json!({"count": 0, "contracts": []})
                        }
                    })
                } else {
                    serde_json::json!({"count": 0, "contracts": []})
                }
            } else {
                serde_json::json!({"count": 0, "contracts": []})
            };

            let logger = crate::governance::AuditLogger::new(&root_path, &policy.audit_log);
            let audit_entries = logger.read_entries().unwrap_or_default();

            let out = serde_json::json!({
                "mode": policy.mode,
                "version": policy.version,
                "invariants_file": policy.invariants_file,
                "lock_file": policy.lock_file,
                "audit_log": policy.audit_log,
                "integrity": integrity_status,
                "contracts": contracts_summary,
                "audit_entries_count": audit_entries.len(),
                "shadow_env": policy.shadow_env,
                "guardrails": policy.guardrails
            });

            let resp = Response::from_string(out.to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        // --- GOUVERNANCE PAR INVARIANTS : AUDIT LOG ---
        if path == "/api/ide/governance/audit" {
            let root_str = query.get("root").map(|s| s.as_str()).unwrap_or(".");
            let root_path = PathBuf::from(root_str);
            let pm = crate::governance::PolicyManager::new(&root_path);
            let policy = pm.load_or_init(None).unwrap_or_default();
            let logger = crate::governance::AuditLogger::new(&root_path, &policy.audit_log);
            let entries = logger.read_entries().unwrap_or_default();

            let resp = Response::from_string(serde_json::json!(entries).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        // --- COMPATIBILITÉ COCKPIT : RUNS, RUN DETAILS & TELEMETRY ---
        if path == "/api/runs" {
            let db_candidates = vec![
                PathBuf::from("data.db"),
                PathBuf::from("../../data.db"),
                PathBuf::from("../data.db"),
            ];
            let db_path = db_candidates.into_iter().find(|p| p.exists()).unwrap_or_else(|| PathBuf::from("data.db"));
            let proj_id = query.get("project_id").map(|s| s.as_str()).unwrap_or("default_workspace");

            let mut runs = Vec::new();
            if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                if let Ok(mut stmt) = conn.prepare("SELECT id, project_id, prompt, status, model, total_tokens, execution_time_ms, created_at, finished_at FROM runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 30") {
                    let rows = stmt.query_map(rusqlite::params![proj_id], |row| {
                        Ok(serde_json::json!({
                            "id": row.get::<_, String>(0)?,
                            "project_id": row.get::<_, String>(1)?,
                            "prompt": row.get::<_, String>(2)?,
                            "status": row.get::<_, String>(3)?,
                            "model": row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "default".to_string()),
                            "total_tokens": row.get::<_, Option<i64>>(5)?.unwrap_or(0),
                            "execution_time_ms": row.get::<_, Option<i64>>(6)?.unwrap_or(0),
                            "created_at": row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                            "finished_at": row.get::<_, Option<String>>(8)?,
                        }))
                    });
                    if let Ok(mapped) = rows {
                        for r in mapped.flatten() {
                            runs.push(r);
                        }
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
            let db_candidates = vec![
                PathBuf::from("data.db"),
                PathBuf::from("../../data.db"),
                PathBuf::from("../data.db"),
            ];
            let db_path = db_candidates.into_iter().find(|p| p.exists()).unwrap_or_else(|| PathBuf::from("data.db"));
            let run_id = query.get("run_id").map(|s| s.as_str()).unwrap_or("");

            let mut run_val = serde_json::Value::Null;
            let mut traces = Vec::new();

            if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                if let Ok(mut stmt) = conn.prepare("SELECT id, project_id, prompt, status, model, total_tokens, execution_time_ms, created_at, finished_at FROM runs WHERE id = ?") {
                    if let Ok(mut rows) = stmt.query(rusqlite::params![run_id]) {
                        if let Ok(Some(row)) = rows.next() {
                            run_val = serde_json::json!({
                                "id": row.get::<_, String>(0).unwrap_or_default(),
                                "project_id": row.get::<_, String>(1).unwrap_or_default(),
                                "prompt": row.get::<_, String>(2).unwrap_or_default(),
                                "status": row.get::<_, String>(3).unwrap_or_default(),
                                "model": row.get::<_, Option<String>>(4).unwrap_or(None).unwrap_or_else(|| "default".to_string()),
                                "total_tokens": row.get::<_, Option<i64>>(5).unwrap_or(None).unwrap_or(0),
                                "execution_time_ms": row.get::<_, Option<i64>>(6).unwrap_or(None).unwrap_or(0),
                                "created_at": row.get::<_, Option<String>>(7).unwrap_or(None).unwrap_or_default(),
                                "finished_at": row.get::<_, Option<String>>(8).unwrap_or(None),
                            });
                        }
                    }
                }

                if let Ok(mut stmt) = conn.prepare("SELECT trace_id, run_id, step_order, step_type, tool_name, payload, timestamp FROM run_traces WHERE run_id = ? ORDER BY step_order ASC") {
                    let rows = stmt.query_map(rusqlite::params![run_id], |row| {
                        Ok(serde_json::json!({
                            "trace_id": row.get::<_, String>(0)?,
                            "run_id": row.get::<_, String>(1)?,
                            "step_order": row.get::<_, i64>(2)?,
                            "step_type": row.get::<_, String>(3)?,
                            "tool_name": row.get::<_, Option<String>>(4)?,
                            "payload": row.get::<_, String>(5)?,
                            "timestamp": row.get::<_, String>(6)?,
                        }))
                    });
                    if let Ok(mapped) = rows {
                        for t in mapped.flatten() {
                            traces.push(t);
                        }
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

        if path == "/api/telemetry" {
            let db_candidates = vec![
                PathBuf::from("data.db"),
                PathBuf::from("../../data.db"),
                PathBuf::from("../data.db"),
            ];
            let db_path = db_candidates.into_iter().find(|p| p.exists()).unwrap_or_else(|| PathBuf::from("data.db"));

            let mut total_runs = 0;
            let mut success_runs = 0;
            let mut total_memories = 0;
            let mut total_tools = 0;

            if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                total_runs = conn.query_row("SELECT COUNT(*) FROM runs", [], |r| r.get::<_, i64>(0)).unwrap_or(0);
                success_runs = conn.query_row("SELECT COUNT(*) FROM runs WHERE status = 'success'", [], |r| r.get::<_, i64>(0)).unwrap_or(0);
                total_memories = conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get::<_, i64>(0)).unwrap_or(0);
                total_tools = conn.query_row("SELECT COUNT(*) FROM tools WHERE is_enabled = 1", [], |r| r.get::<_, i64>(0)).unwrap_or(0);
            }

            let resp = Response::from_string(serde_json::json!({
                "total_runs": total_runs,
                "success_runs": success_runs,
                "total_memories": total_memories,
                "active_tools": total_tools + 6,
                "backends": []
            }).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        // --- GOUVERNANCE PAR INVARIANTS : LISTING DES CONTRATS & INVARIANTS ---
        if path == "/api/ide/invariants" {
            let root_str = query.get("root").map(|s| s.as_str()).unwrap_or(".");
            let root_path = PathBuf::from(root_str);
            let pm = crate::governance::PolicyManager::new(&root_path);
            let policy = pm.load_or_init(None).unwrap_or_default();

            let inv_candidates = vec![
                root_path.join(&policy.invariants_file),
                PathBuf::from(&policy.invariants_file),
                PathBuf::from(".ide/invariants.json"),
                PathBuf::from("../../.ide/invariants.json"),
                PathBuf::from("invariants.json"),
            ];

            let inv_path = inv_candidates.into_iter().find(|p| p.exists());

            let res_json = if let Some(path) = inv_path {
                if let Ok(c) = fs::read_to_string(&path) {
                    serde_json::from_str::<Value>(&c).unwrap_or_else(|_| serde_json::json!({ "invariants": [], "contracts": [] }))
                } else {
                    serde_json::json!({ "invariants": [], "contracts": [] })
                }
            } else {
                serde_json::json!({ "invariants": [], "contracts": [] })
            };

            let resp = Response::from_string(res_json.to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        // --- BASE DE CONNAISSANCES D'EXPÉRIENCE (BCPE) : LISTE & RECHERCHE ---
        if path == "/api/ide/kb/entries" {
            let q_filter = query.get("q").map(|s| s.to_lowercase()).unwrap_or_default();
            let kind_filter = query.get("kind").map(|s| s.as_str()).unwrap_or("");
            let status_filter = query.get("status").map(|s| s.as_str()).unwrap_or("");

            // Chercher la base kb.db (relatif ou dans earnest-bcpe)
            let kb_candidates = vec![
                PathBuf::from("earnest-bcpe/kb.db"),
                PathBuf::from("../earnest-bcpe/kb.db"),
                PathBuf::from("../../earnest-bcpe/kb.db"),
                PathBuf::from("kb.db"),
            ];

            let mut kb_path = PathBuf::from("earnest-bcpe/kb.db");
            for cand in kb_candidates {
                if cand.exists() {
                    kb_path = cand;
                    break;
                }
            }

            if !kb_path.exists() {
                let resp = Response::from_string(serde_json::json!({
                    "entries": [],
                    "total": 0,
                    "kb_path": kb_path.to_string_lossy(),
                    "warning": "Base de connaissances kb.db non trouvée."
                }).to_string())
                .with_header(json_header)
                .with_header(cors_header);
                req.respond(resp).ok();
                return;
            }

            let mut items = Vec::new();
            if let Ok(conn) = rusqlite::Connection::open(&kb_path) {
                let sql = "SELECT entry_id, product_id, subject_key, kind, title, symptom, cause, correction, example, status, source, validated_by, validated_at, use_count, fail_count, updated_at FROM entries ORDER BY entry_id DESC";
                if let Ok(mut stmt) = conn.prepare(sql) {
                    let rows = stmt.query_map([], |row| {
                        Ok(serde_json::json!({
                            "entry_id": row.get::<_, i64>(0)?,
                            "product_id": row.get::<_, String>(1)?,
                            "subject_key": row.get::<_, String>(2)?,
                            "kind": row.get::<_, String>(3)?,
                            "title": row.get::<_, String>(4)?,
                            "symptom": row.get::<_, Option<String>>(5)?,
                            "cause": row.get::<_, Option<String>>(6)?,
                            "correction": row.get::<_, String>(7)?,
                            "example": row.get::<_, Option<String>>(8)?,
                            "status": row.get::<_, String>(9)?,
                            "source": row.get::<_, String>(10)?,
                            "validated_by": row.get::<_, Option<String>>(11)?,
                            "validated_at": row.get::<_, Option<String>>(12)?,
                            "use_count": row.get::<_, i64>(13)?,
                            "fail_count": row.get::<_, i64>(14)?,
                            "updated_at": row.get::<_, String>(15)?,
                        }))
                    });

                    if let Ok(mapped) = rows {
                        for item in mapped.flatten() {
                            let title = item["title"].as_str().unwrap_or("").to_lowercase();
                            let symptom = item["symptom"].as_str().unwrap_or("").to_lowercase();
                            let cause = item["cause"].as_str().unwrap_or("").to_lowercase();
                            let correction = item["correction"].as_str().unwrap_or("").to_lowercase();
                            let item_kind = item["kind"].as_str().unwrap_or("");
                            let item_status = item["status"].as_str().unwrap_or("");

                            // Filtres
                            if !kind_filter.is_empty() && item_kind != kind_filter {
                                continue;
                            }
                            if !status_filter.is_empty() && item_status != status_filter {
                                continue;
                            }
                            if !q_filter.is_empty() && !title.contains(&q_filter) && !symptom.contains(&q_filter) && !cause.contains(&q_filter) && !correction.contains(&q_filter) {
                                continue;
                            }

                            items.push(item);
                        }
                    }
                }
            }

            let resp = Response::from_string(serde_json::json!({
                "entries": items,
                "total": items.len(),
                "kb_path": kb_path.to_string_lossy()
            }).to_string())
            .with_header(json_header)
            .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }
    }

    // 2. ENDPOINTS POST
    if method == Method::Post {
        let mut body = String::new();
        req.as_reader().read_to_string(&mut body).ok();
        let payload: Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));

        if path == "/api/ide/save_file" {
            let file_path = payload["path"].as_str().unwrap_or("");
            let content = payload["content"].as_str().unwrap_or("");
            match write_file(file_path, content) {
                Ok(res) => {
                    let mtime = std::fs::metadata(file_path).and_then(|m| m.modified()).map(|t| {
                        t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
                    }).unwrap_or(0);
                    let mut obj = res.as_object().cloned().unwrap_or_default();
                    obj.insert("mtime".to_string(), serde_json::json!(mtime));
                    let resp = Response::from_string(serde_json::json!(obj).to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(500).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/rename" {
            let old_path = payload["old_path"].as_str().unwrap_or("");
            let new_path = payload["new_path"].as_str().unwrap_or("");
            match rename_file_or_dir(old_path, new_path) {
                Ok(res) => {
                    let resp = Response::from_string(res.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/delete" {
            let file_path = payload["path"].as_str().unwrap_or("");
            match delete_file_or_dir(file_path) {
                Ok(res) => {
                    let resp = Response::from_string(res.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/create_item" {
            let file_path = payload["path"].as_str().unwrap_or("");
            let is_dir = payload["is_dir"].as_bool().unwrap_or(false);
            let res = if is_dir {
                create_directory(file_path)
            } else {
                write_file(file_path, "")
            };
            match res {
                Ok(r) => {
                    let resp = Response::from_string(r.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/git/commit" {
            let root = payload["root"].as_str().unwrap_or(".");
            let message = payload["message"].as_str().unwrap_or("Mise à jour Earnest IDE");
            match git_commit(root, message) {
                Ok(val) => {
                    let resp = Response::from_string(val.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/ai/inline_edit" {
            let prompt = payload["prompt"].as_str().unwrap_or("");
            let file_path = payload["file_path"].as_str().unwrap_or("");
            let selected_code = payload["selected_code"].as_str().unwrap_or("");
            let entire_content = payload["entire_content"].as_str().unwrap_or("");

            let conn = match get_connection(None) {
                Ok(c) => c,
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e.to_string()}).to_string()).with_status_code(500).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                    return;
                }
            };
            let router = LLMRouter::from_db(&conn);

            let sys_prompt = "Tu es un assistant de transformation de code ultra-précis (style Cursor Ctrl+K). \
L'utilisateur te donne un extrait de code sélectionné et une consigne d'édition. \
Tu dois retourner UNIQUEMENT le bloc de code modifié qui remplacera la sélection, SANS explications, SANS markdown ``` ou balises de code autour. \
Garde l'indentation appropriée.";

            let user_msg = format!(
                "Fichier : {}\nInstruction : {}\nCode sélectionné à modifier :\n{}\n\nContexte global du fichier :\n{}",
                file_path, prompt, selected_code, entire_content
            );

            let messages = vec![
                crate::llm::client::ChatMessage { role: "system".to_string(), content: sys_prompt.to_string(), images: None },
                crate::llm::client::ChatMessage { role: "user".to_string(), content: user_msg, images: None },
            ];

            match router.chat_completion_with_fallback(&messages, None) {
                Ok((res, backend)) => {
                    let clean_replacement = res.content.trim_matches('`').trim();
                    let resp = Response::from_string(serde_json::json!({
                        "status": "success",
                        "replacement": clean_replacement,
                        "backend": backend
                    }).to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e.to_string()}).to_string()).with_status_code(500).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/model_providers" || path == "/api/model_providers" {
            let conn = get_connection(None).unwrap();
            let p_id = payload["id"].as_str().map(|s| s.to_string()).unwrap_or_else(|| format!("provider_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..8]));
            let name = payload["name"].as_str().unwrap_or("Nouveau Modèle");
            let provider_type = payload["provider_type"].as_str().unwrap_or("openai");
            let base_url = payload["base_url"].as_str().unwrap_or("http://127.0.0.1:1234").trim_end_matches('/');
            let model = payload["model"].as_str().unwrap_or("default");
            let raw_key = payload["api_key"].as_str();
            let is_enabled = if payload["is_enabled"].as_bool().unwrap_or(true) { 1 } else { 0 };

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

        if path == "/api/ide/model_providers/toggle" || path == "/api/model_providers/toggle" {
            let conn = get_connection(None).unwrap();
            let p_id = payload["id"].as_str().unwrap_or("");
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

        if path == "/api/ide/model_providers/delete" || path == "/api/model_providers/delete" {
            let conn = get_connection(None).unwrap();
            let p_id = payload["id"].as_str().unwrap_or("");
            conn.execute("DELETE FROM model_providers WHERE id = ?", [p_id]).ok();
            let resp = Response::from_string(serde_json::json!({"status": "deleted", "id": p_id}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/settings" {
            let conn = get_connection(None).unwrap();
            if let Some(obj) = payload.as_object() {
                for (k, v) in obj {
                    let val_str = v.as_str().unwrap_or("");
                    if val_str != "***" {
                        conn.execute(
                            "INSERT INTO app_settings (key, value, is_secret, updated_at) VALUES (?, ?, 0, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                            rusqlite::params![k, val_str],
                        ).ok();
                    }
                }
            }
            let resp = Response::from_string(serde_json::json!({"status": "ok"}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/mcp/servers" {
            let conn = get_connection(None).unwrap();
            let servers = payload.get("servers").cloned().unwrap_or_else(|| serde_json::json!([]));
            let json_str = serde_json::to_string(&servers).unwrap_or_else(|_| "[]".to_string());
            conn.execute(
                "INSERT INTO app_settings (key, value, is_secret, updated_at) VALUES ('mcp_servers_config', ?, 0, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                rusqlite::params![json_str],
            ).ok();
            let resp = Response::from_string(serde_json::json!({"status": "ok"}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/projects" {
            let conn = get_connection(None).unwrap();
            let p_id = payload["id"].as_str().map(|s| s.to_string()).unwrap_or_else(|| format!("proj_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..8]));
            let name = payload["name"].as_str().unwrap_or("Nouveau Projet");
            let root_path = payload["root_path"].as_str().unwrap_or(".");
            let desc = payload["description"].as_str().unwrap_or("");

            conn.execute(
                "INSERT INTO projects (id, name, root_path, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name=excluded.name, root_path=excluded.root_path, description=excluded.description, updated_at=CURRENT_TIMESTAMP",
                rusqlite::params![p_id, name, root_path, desc],
            ).ok();

            let resp = Response::from_string(serde_json::json!({"status": "saved", "id": p_id}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/projects/delete" {
            let conn = get_connection(None).unwrap();
            let p_id = payload["id"].as_str().unwrap_or("");
            conn.execute("DELETE FROM projects WHERE id = ?", [p_id]).ok();
            let resp = Response::from_string(serde_json::json!({"status": "deleted", "id": p_id}).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/lsp/complete" {
            let lang = payload["language"].as_str().unwrap_or("plaintext");
            let code = payload["code"].as_str().unwrap_or("");
            let line = payload["line"].as_u64().unwrap_or(1);
            let column = payload["column"].as_u64().unwrap_or(1);
            let file_path = payload["path"].as_str().unwrap_or("unknown");

            // Chercher l'interpréteur python configuré
            let conn = get_connection(None).unwrap();
            let py_interp: Option<String> = conn.query_row("SELECT value FROM app_settings WHERE key = 'python_interpreter'", [], |r| r.get(0)).ok();

            let res = crate::lsp::handle_lsp_complete(lang, code, line, column, file_path, py_interp);
            let out = match res {
                Ok(val) => val,
                Err(err) => serde_json::json!({"error": err, "items": []})
            };

            let resp = Response::from_string(out.to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/lsp/hover" {
            let lang = payload["language"].as_str().unwrap_or("plaintext");
            let code = payload["code"].as_str().unwrap_or("");
            let line = payload["line"].as_u64().unwrap_or(1);
            let column = payload["column"].as_u64().unwrap_or(1);
            let file_path = payload["path"].as_str().unwrap_or("unknown");

            let conn = get_connection(None).unwrap();
            let py_interp: Option<String> = conn.query_row("SELECT value FROM app_settings WHERE key = 'python_interpreter'", [], |r| r.get(0)).ok();

            let res = crate::lsp::handle_lsp_hover(lang, code, line, column, file_path, py_interp);
            let out = match res {
                Ok(val) => val,
                Err(err) => serde_json::json!({"error": err, "contents": []})
            };

            let resp = Response::from_string(out.to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/lsp/definition" {
            let lang = payload["language"].as_str().unwrap_or("plaintext");
            let root = payload["root"].as_str().unwrap_or(".");
            let path_str = payload["path"].as_str().unwrap_or("unknown");
            let symbol = payload["symbol"].as_str().unwrap_or("");
            let code = payload["code"].as_str().unwrap_or("");
            let line = payload["line"].as_u64().unwrap_or(1);
            let column = payload["column"].as_u64().unwrap_or(1);

            let conn = get_connection(None).unwrap();
            let py_interp: Option<String> = conn.query_row("SELECT value FROM app_settings WHERE key = 'python_interpreter'", [], |r| r.get(0)).ok();

            let res = crate::lsp::handle_lsp_definition(lang, root, path_str, symbol, code, line, column, py_interp);
            let out = match res {
                Ok(val) => val,
                Err(err) => serde_json::json!({"error": err, "definitions": []})
            };

            let resp = Response::from_string(out.to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/lsp/signatures" {
            let lang = payload["language"].as_str().unwrap_or("plaintext");
            let code = payload["code"].as_str().unwrap_or("");
            let line = payload["line"].as_u64().unwrap_or(1);
            let column = payload["column"].as_u64().unwrap_or(1);
            let file_path = payload["path"].as_str().unwrap_or("unknown");

            let conn = get_connection(None).unwrap();
            let py_interp: Option<String> = conn.query_row("SELECT value FROM app_settings WHERE key = 'python_interpreter'", [], |r| r.get(0)).ok();

            let res = crate::lsp::handle_lsp_signatures(lang, code, line, column, file_path, py_interp);
            let out = match res {
                Ok(val) => val,
                Err(err) => serde_json::json!({"error": err, "signatures": []})
            };

            let resp = Response::from_string(out.to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        if path == "/api/ide/settings" {
            let conn = get_connection(None).unwrap();
            if let Some(obj) = payload.as_object() {
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

        if path == "/api/ide/terminal" {
            let cmd = payload["command"].as_str().unwrap_or("");
            let timeout = payload["timeout_secs"].as_u64().unwrap_or(30);
            match execute_terminal(cmd, timeout) {
                Ok(res) => {
                    let resp = Response::from_string(res.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e, "status": "error"}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        if path == "/api/ide/grep" {
            let query = payload["query"].as_str().unwrap_or("");
            let root = payload["root"].as_str().unwrap_or(".");
            match grep_search(root, query, Some(50)) {
                Ok(res) => {
                    let resp = Response::from_string(res.to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"error": e}).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        // Exécution de l'agent de programmation en flux SSE
        if path == "/api/ide/run/stream" {
            let prompt = payload["prompt"].as_str().unwrap_or("").to_string();
            let project = payload["project"].as_str().unwrap_or("earnest_ide_workspace").to_string();

            let sse_header = Header::from_bytes(&b"Content-Type"[..], &b"text/event-stream"[..]).unwrap();
            let cache_header = Header::from_bytes(&b"Cache-Control"[..], &b"no-cache"[..]).unwrap();
            let conn_header = Header::from_bytes(&b"Connection"[..], &b"keep-alive"[..]).unwrap();

            let (reader, mut writer) = match std::io::pipe() {
                Ok(p) => p,
                Err(_) => {
                    req.respond(Response::empty(500)).ok();
                    return;
                }
            };
            let resp = Response::empty(200)
                .with_data(reader, None)
                .with_header(sse_header)
                .with_header(cache_header)
                .with_header(conn_header)
                .with_header(cors_header);

            thread::spawn(move || {
                use std::io::Write;
                let conn = match get_connection(None) {
                    Ok(c) => c,
                    Err(_) => return,
                };
                let router = LLMRouter::from_db(&conn);
                let engine = ReActEngine::new(&conn, &router, &project);

                let _ = writeln!(writer, "event: init\ndata: {}\n\n", serde_json::json!({"status": "started"}));
                writer.flush().ok();

                let res = engine.run_with_callback(&prompt, |r_id, step, s_type, t_name, pay, backend| {
                    let trace_json = serde_json::json!({
                        "run_id": r_id,
                        "step": step,
                        "step_type": s_type,
                        "tool_name": t_name,
                        "payload": pay,
                        "backend": backend
                    });
                    let _ = writeln!(writer, "event: trace\ndata: {}\n\n", trace_json);
                    writer.flush().ok();
                });

                match res {
                    Ok(r) => {
                        let comp_json = serde_json::json!({
                            "status": r.status,
                            "run_id": r.run_id,
                            "answer": r.answer,
                            "tokens": r.total_tokens,
                            "duration_ms": r.duration_ms
                        });
                        let _ = writeln!(writer, "event: completed\ndata: {}\n\n", comp_json);
                    }
                    Err(e) => {
                        let _ = writeln!(writer, "event: error\ndata: {}\n\n", serde_json::json!({"error": e}));
                    }
                }
                writer.flush().ok();
            });

            req.respond(resp).ok();
            return;
        }

        // --- GOUVERNANCE PAR INVARIANTS : INITIALISATION DU MODE ---
        if path == "/api/ide/governance/init_mode" {
            let root_str = payload["root"].as_str().unwrap_or(".");
            let mode_str = payload["mode"].as_str().unwrap_or("normal");
            let root_path = PathBuf::from(root_str);

            let requested_mode = match mode_str {
                "architecture" | "archi" => crate::governance::GovernanceMode::Architecture,
                "constrained" => crate::governance::GovernanceMode::Constrained,
                _ => crate::governance::GovernanceMode::Normal,
            };

            let pm = crate::governance::PolicyManager::new(&root_path);
            match pm.load_or_init(Some(requested_mode)) {
                Ok(policy) => {
                    let resp = Response::from_string(serde_json::json!({
                        "status": "success",
                        "mode": policy.mode,
                        "policy": policy
                    }).to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"status": "error", "error": e}).to_string())
                        .with_status_code(500).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        // --- GOUVERNANCE PAR INVARIANTS : REVALIDATION DES INVARIANTS (EXECUTION SONDES) ---
        if path == "/api/ide/governance/check_invariants" {
            let root_str = payload["root"].as_str().or_else(|| query.get("root").map(|s| s.as_str())).unwrap_or(".");
            let root_path = PathBuf::from(root_str);

            let python_bin = if cfg!(windows) { "python" } else { "python3" };
            let script_candidates = vec![
                root_path.join("tests/validate_invariants.py"),
                PathBuf::from("tests/validate_invariants.py"),
                PathBuf::from("../tests/validate_invariants.py"),
            ];

            let script_path = script_candidates.into_iter().find(|p| p.exists())
                .unwrap_or_else(|| PathBuf::from("tests/validate_invariants.py"));

            let output = std::process::Command::new(python_bin)
                .arg(&script_path)
                .current_dir(&root_path)
                .output();

            let (success, out_str) = match output {
                Ok(out) => {
                    let combined = format!(
                        "{}\n{}",
                        String::from_utf8_lossy(&out.stdout),
                        String::from_utf8_lossy(&out.stderr)
                    ).trim().to_string();
                    (out.status.success(), combined)
                }
                Err(e) => (false, format!("Erreur exécution python: {}", e)),
            };

            let resp = Response::from_string(serde_json::json!({
                "success": success,
                "output": out_str
            }).to_string())
                .with_header(json_header)
                .with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        // --- GOUVERNANCE PAR INVARIANTS : APPROBATION REVUE ARCHITECTURE (Mode 3 -> Mode 2) ---
        if path == "/api/ide/governance/review_approve" {
            let root_str = payload["root"].as_str().unwrap_or(".");
            let root_path = PathBuf::from(root_str);
            let pm = crate::governance::PolicyManager::new(&root_path);
            let mut policy = pm.load_or_init(None).unwrap_or_default();

            let inv_path = root_path.join(&policy.invariants_file);
            let _lock_path = root_path.join(&policy.lock_file);

            if !inv_path.exists() {
                let resp = Response::from_string(serde_json::json!({
                    "status": "error",
                    "error": format!("Fichier {} introuvable pour scellement", policy.invariants_file)
                }).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                req.respond(resp).ok();
                return;
            }

            // Lire les invariants et sceller cryptographiquement avec chmod 444 (set_readonly(true))
            let inv_content = fs::read_to_string(&inv_path).unwrap_or_default();
            let inv_file: crate::governance::InvariantsFile = match serde_json::from_str(&inv_content) {
                Ok(f) => f,
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({
                        "status": "error",
                        "error": format!("Erreur parse JSON invariants: {}", e)
                    }).to_string()).with_status_code(400).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                    return;
                }
            };

            // Scellement
            match crate::governance::invariants::seal_invariants(&root_path, &policy.invariants_file, &policy.lock_file, &inv_file) {
                Ok(sealed_hash) => {
                    // Transition d'état : Passage en Mode 2 Contraint
                    policy.mode = crate::governance::GovernanceMode::Constrained;
                    pm.save(&policy).ok();

                    // Journal d'audit
                    let logger = crate::governance::AuditLogger::new(&root_path, &policy.audit_log);
                    let entry = crate::governance::AuditEntry {
                        event_id: format!("seal_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..8]),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        initiator: "developer_ui".to_string(),
                        target_invariant_id: "ALL_CONTRACTS".to_string(),
                        reason: "Approbation de l'architecture initiale et scellement SHA-256 (Mode 3 -> Mode 2)".to_string(),
                        previous_hash: "NONE".to_string(),
                        new_hash: sealed_hash.clone(),
                        diff: "Initial Seal".to_string(),
                        approved_by: "developer".to_string(),
                    };
                    logger.append(&entry).ok();

                    let resp = Response::from_string(serde_json::json!({
                        "status": "SEALED",
                        "new_mode": "constrained",
                        "sealed_hash": sealed_hash,
                        "contracts_count": inv_file.contracts.len()
                    }).to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"status": "error", "error": e}).to_string())
                        .with_status_code(500).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        // --- GOUVERNANCE PAR INVARIANTS : APPROBATION MUTATION CONTRAT (Mode 2) ---
        if path == "/api/ide/governance/mutation_approve" {
            let root_str = payload["root"].as_str().unwrap_or(".");
            let target_contract_id = payload["target_contract_id"].as_str().unwrap_or("");
            let reason = payload["reason"].as_str().unwrap_or("Mutation approuvée par le développeur");
            let diff_str = payload["diff"].as_str().unwrap_or("");
            let root_path = PathBuf::from(root_str);

            let pm = crate::governance::PolicyManager::new(&root_path);
            let policy = pm.load_or_init(None).unwrap_or_default();

            // Récupérer l'ancien hash
            let prev_hash = crate::governance::invariants::verify_invariants_lock(&root_path, &policy.invariants_file, &policy.lock_file)
                .unwrap_or_else(|_| "UNKNOWN".to_string());

            // Déverrouillage explicite (set_readonly(false)), modification et re-scellement immédiat (Contrainte 3)
            let mutate_result = crate::governance::invariants::mutate_invariants(
                &root_path,
                &policy.invariants_file,
                &policy.lock_file,
                |inv_file| {
                    // Si des updated_probes ou contract sont fournis dans le payload
                    if let Some(probes_val) = payload.get("updated_probes").and_then(|v| v.as_array()) {
                        if let Some(target_contract) = inv_file.contracts.iter_mut().find(|c| c.id == target_contract_id) {
                            let mut new_probes: Vec<crate::governance::ProbeSpec> = Vec::new();
                            for pv in probes_val {
                                if let Ok(probe) = serde_json::from_value(pv.clone()) {
                                    new_probes.push(probe);
                                }
                            }
                            if !new_probes.is_empty() {
                                target_contract.probes = new_probes;
                            }
                        }
                    }
                    Ok(())
                }
            );

            match mutate_result {
                Ok(new_hash) => {
                    // Journal d'audit append-only
                    let logger = crate::governance::AuditLogger::new(&root_path, &policy.audit_log);
                    let entry = crate::governance::AuditEntry {
                        event_id: format!("mut_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..8]),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        initiator: payload["initiator"].as_str().unwrap_or("developer").to_string(),
                        target_invariant_id: target_contract_id.to_string(),
                        reason: reason.to_string(),
                        previous_hash: prev_hash,
                        new_hash: new_hash.clone(),
                        diff: diff_str.to_string(),
                        approved_by: "developer".to_string(),
                    };
                    logger.append(&entry).ok();

                    let resp = Response::from_string(serde_json::json!({
                        "status": "MUTATION_SEALED",
                        "new_hash": new_hash,
                        "target_contract_id": target_contract_id
                    }).to_string()).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
                Err(e) => {
                    let resp = Response::from_string(serde_json::json!({"status": "error", "error": e}).to_string())
                        .with_status_code(500).with_header(json_header).with_header(cors_header);
                    req.respond(resp).ok();
                }
            }
            return;
        }

        // --- GOUVERNANCE PAR INVARIANTS : AUTORISATION ESSAI #4 (Point de Contrôle Réflexif) ---
        if path == "/api/ide/governance/retry_authorize" {
            let failed_probe_id = payload["failed_probe_id"].as_str().unwrap_or("");
            // Débloque pour une tentative supplémentaire
            let resp = Response::from_string(serde_json::json!({
                "status": "RETRY_AUTHORIZED",
                "probe_id": failed_probe_id,
                "message": format!("Tentative supplémentaire autorisée pour la sonde '{}'.", failed_probe_id)
            }).to_string()).with_header(json_header).with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        // --- BASE DE CONNAISSANCES D'EXPÉRIENCE (BCPE) : ANNOTATION & VALIDATION ---
        if path == "/api/ide/kb/annotate" {
            let entry_id = payload["entry_id"].as_i64().unwrap_or(0);
            let new_status = payload["status"].as_str().unwrap_or("valide");
            let annotator = payload["annotator"].as_str().unwrap_or("developer");
            let correction = payload["correction"].as_str();

            let kb_candidates = vec![
                PathBuf::from("earnest-bcpe/kb.db"),
                PathBuf::from("../earnest-bcpe/kb.db"),
                PathBuf::from("../../earnest-bcpe/kb.db"),
                PathBuf::from("kb.db"),
            ];
            let mut kb_path = PathBuf::from("earnest-bcpe/kb.db");
            for cand in kb_candidates {
                if cand.exists() {
                    kb_path = cand;
                    break;
                }
            }

            if let Ok(conn) = rusqlite::Connection::open(&kb_path) {
                let now = chrono::Utc::now().to_rfc3339();
                let res = if let Some(corr) = correction {
                    conn.execute(
                        "UPDATE entries SET status = ?, validated_by = ?, validated_at = ?, correction = ?, updated_at = ? WHERE entry_id = ?",
                        rusqlite::params![new_status, annotator, now, corr, now, entry_id],
                    )
                } else {
                    conn.execute(
                        "UPDATE entries SET status = ?, validated_by = ?, validated_at = ?, updated_at = ? WHERE entry_id = ?",
                        rusqlite::params![new_status, annotator, now, now, entry_id],
                    )
                };

                match res {
                    Ok(affected) => {
                        let resp = Response::from_string(serde_json::json!({
                            "status": "OK",
                            "affected": affected,
                            "entry_id": entry_id,
                            "new_status": new_status,
                            "validated_by": annotator,
                            "validated_at": now
                        }).to_string()).with_header(json_header).with_header(cors_header);
                        req.respond(resp).ok();
                        return;
                    }
                    Err(e) => {
                        let resp = Response::from_string(serde_json::json!({"status": "error", "error": e.to_string()}).to_string())
                            .with_status_code(500).with_header(json_header).with_header(cors_header);
                        req.respond(resp).ok();
                        return;
                    }
                }
            }

            let resp = Response::from_string(serde_json::json!({"status": "error", "error": "kb.db inaccessible"}).to_string())
                .with_status_code(500).with_header(json_header).with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

        // --- BASE DE CONNAISSANCES D'EXPÉRIENCE (BCPE) : CRÉATION D'UNE RÈGLE/PIÈGE ---
        if path == "/api/ide/kb/create" {
            let product_id = payload["product_id"].as_str().unwrap_or("earnest");
            let kind = payload["kind"].as_str().unwrap_or("regle");
            let title = payload["title"].as_str().unwrap_or("").trim();
            let symptom = payload["symptom"].as_str().unwrap_or("").trim();
            let cause = payload["cause"].as_str().unwrap_or("").trim();
            let correction = payload["correction"].as_str().unwrap_or("").trim();
            let example = payload["example"].as_str().unwrap_or("").trim();
            let author = payload["author"].as_str().unwrap_or("developer");

            if title.is_empty() || correction.is_empty() {
                let resp = Response::from_string(serde_json::json!({"status": "error", "error": "Le titre et la solution sont obligatoires"}).to_string())
                    .with_status_code(400).with_header(json_header).with_header(cors_header);
                req.respond(resp).ok();
                return;
            }

            let kb_candidates = vec![
                PathBuf::from("earnest-bcpe/kb.db"),
                PathBuf::from("../earnest-bcpe/kb.db"),
                PathBuf::from("../../earnest-bcpe/kb.db"),
                PathBuf::from("kb.db"),
            ];
            let mut kb_path = PathBuf::from("earnest-bcpe/kb.db");
            for cand in kb_candidates {
                if cand.exists() {
                    kb_path = cand;
                    break;
                }
            }

            let subject_key = format!("usr_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..10]);
            let now = chrono::Utc::now().to_rfc3339();

            if let Ok(conn) = rusqlite::Connection::open(&kb_path) {
                conn.execute(
                    "INSERT OR IGNORE INTO products (product_id, name, current_version) VALUES (?, ?, ?)",
                    rusqlite::params![product_id, product_id, "1.0.0"],
                ).ok();

                let res = conn.execute(
                    "INSERT INTO entries (product_id, subject_key, kind, title, symptom, cause, correction, example, status, source, validated_by, validated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'valide', 'human_expert', ?, ?, ?, ?)",
                    rusqlite::params![
                        product_id,
                        subject_key,
                        kind,
                        title,
                        if symptom.is_empty() { None } else { Some(symptom) },
                        if cause.is_empty() { None } else { Some(cause) },
                        correction,
                        if example.is_empty() { None } else { Some(example) },
                        author,
                        now,
                        now,
                        now
                    ],
                );

                match res {
                    Ok(_) => {
                        let last_id = conn.last_insert_rowid();
                        let resp = Response::from_string(serde_json::json!({
                            "status": "CREATED",
                            "entry_id": last_id,
                            "subject_key": subject_key
                        }).to_string()).with_header(json_header).with_header(cors_header);
                        req.respond(resp).ok();
                        return;
                    }
                    Err(e) => {
                        let resp = Response::from_string(serde_json::json!({"status": "error", "error": e.to_string()}).to_string())
                            .with_status_code(500).with_header(json_header).with_header(cors_header);
                        req.respond(resp).ok();
                        return;
                    }
                }
            }

            let resp = Response::from_string(serde_json::json!({"status": "error", "error": "kb.db inaccessible"}).to_string())
                .with_status_code(500).with_header(json_header).with_header(cors_header);
            req.respond(resp).ok();
            return;
        }

    }

    // 3. FICHIERS STATIQUES (UI EMBARQUÉE OU SERVIE)
    serve_static_asset(req, &path);
}

fn serve_static_asset(req: tiny_http::Request, path: &str) {
    let asset_path = if path == "/" || path.is_empty() {
        "index.html".to_string()
    } else {
        path.trim_start_matches('/').to_string()
    };

    let mime_type = match asset_path.split('.').last().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "ttf" => "font/ttf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "text/plain; charset=utf-8",
    };

    let content_type = Header::from_bytes(&b"Content-Type"[..], mime_type.as_bytes()).unwrap();

    // 1. Essai de lecture directe sur disque (pour live dev sans recompile)
    let local_fs_path = PathBuf::from("earnest-ide/ui").join(&asset_path);
    if local_fs_path.exists() && local_fs_path.is_file() {
        if let Ok(bytes) = fs::read(&local_fs_path) {
            let resp = Response::from_data(bytes).with_header(content_type);
            req.respond(resp).ok();
            return;
        }
    }

    // 2. Fallback sur l'asset embarqué
    if let Some(file) = Asset::get(&asset_path) {
        let resp = Response::from_data(file.data.into_owned()).with_header(content_type);
        req.respond(resp).ok();
        return;
    }

    // Si la ressource demandée était un asset statique (.js, .css, .json, .ttf, etc.) non trouvé, renvoyer 404 au lieu du HTML
    if asset_path.contains('.') {
        req.respond(Response::empty(404)).ok();
        return;
    }

    // 3. Fallback SPA index.html (uniquement pour les routes de navigation sans extension)
    if let Some(file) = Asset::get("index.html") {
        let html_type = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap();
        let resp = Response::from_data(file.data.into_owned()).with_header(html_type);
        req.respond(resp).ok();
        return;
    }

    req.respond(Response::empty(404)).ok();
}
