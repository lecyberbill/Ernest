use std::path::Path;
use serde_json::Value;

pub fn find_rust_definition(root: &str, _file_path: &str, symbol: &str) -> Option<Value> {
    if symbol.is_empty() { return None; }

    let patterns = [
        format!("fn {}", symbol),
        format!("struct {}", symbol),
        format!("enum {}", symbol),
        format!("trait {}", symbol),
        format!("type {} =", symbol),
        format!("let mut {}", symbol),
        format!("let {}", symbol),
        format!("const {}", symbol),
    ];

    let search_dir = if Path::new(root).is_dir() { root } else { "." };

    for pat in &patterns {
        let res = crate::tools::search::grep_search(search_dir, pat, Some(5));
        if let Ok(val) = res {
            if let Some(matches) = val["matches"].as_array() {
                if let Some(first) = matches.first() {
                    return Some(serde_json::json!({
                        "file": first["file"].as_str().unwrap_or(""),
                        "line": first["line"].as_u64().unwrap_or(1),
                        "column": 1
                    }));
                }
            }
        }
    }

    None
}

