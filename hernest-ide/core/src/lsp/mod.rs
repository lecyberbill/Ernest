pub mod python;
pub mod indexer;
pub mod rust;

use serde_json::Value;

pub fn handle_lsp_complete(lang: &str, code: &str, line: u64, column: u64, path: &str, interpreter: Option<String>) -> Result<Value, String> {
    if lang == "python" || path.ends_with(".py") {
        let worker = python::PythonLspWorker::new(interpreter);
        let params = serde_json::json!({
            "code": code,
            "line": line,
            "column": column,
            "path": path
        });
        if let Ok(res) = worker.handle_request("complete", &params) {
            if let Some(items) = res.get("items") {
                if items.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                    return Ok(serde_json::json!({ "items": items, "source": "jedi" }));
                }
            }
        }
    }

    // Fallback dynamique par indexation lexicale locale
    let items = indexer::extract_local_code_symbols(code, lang);
    Ok(serde_json::json!({
        "items": items,
        "source": "local-index"
    }))
}

pub fn handle_lsp_hover(lang: &str, code: &str, line: u64, column: u64, path: &str, interpreter: Option<String>) -> Result<Value, String> {
    if lang == "python" || path.ends_with(".py") {
        let worker = python::PythonLspWorker::new(interpreter);
        let params = serde_json::json!({
            "code": code,
            "line": line,
            "column": column,
            "path": path
        });
        if let Ok(res) = worker.handle_request("hover", &params) {
            return Ok(res);
        }
    }

    Ok(serde_json::json!({ "contents": [] }))
}

pub fn handle_lsp_definition(lang: &str, root: &str, path: &str, symbol: &str, code: &str, line: u64, column: u64, interpreter: Option<String>) -> Result<Value, String> {
    if lang == "python" || path.ends_with(".py") {
        let worker = python::PythonLspWorker::new(interpreter);
        let params = serde_json::json!({
            "code": code,
            "line": line,
            "column": column,
            "path": path
        });
        if let Ok(res) = worker.handle_request("definition", &params) {
            if let Some(defs) = res.get("definitions") {
                if defs.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                    return Ok(res);
                }
            }
        }
    }

    if lang == "rust" || path.ends_with(".rs") {
        if let Some(def) = rust::find_rust_definition(root, path, symbol) {
            return Ok(serde_json::json!({
                "definitions": [def]
            }));
        }
    }

    Ok(serde_json::json!({ "definitions": [] }))
}

pub fn handle_lsp_signatures(lang: &str, code: &str, line: u64, column: u64, path: &str, interpreter: Option<String>) -> Result<Value, String> {
    if lang == "python" || path.ends_with(".py") {
        let worker = python::PythonLspWorker::new(interpreter);
        let params = serde_json::json!({
            "code": code,
            "line": line,
            "column": column,
            "path": path
        });
        if let Ok(res) = worker.handle_request("signatures", &params) {
            return Ok(res);
        }
    }

    Ok(serde_json::json!({ "signatures": [] }))
}
