use std::process::Command;
use std::path::Path;
use serde_json::Value;

pub fn run_project_diagnostics(root_dir: &str) -> Result<Value, String> {
    let p = Path::new(root_dir);
    let mut diagnostics = Vec::new();

    // 1. Détection de projet Rust (Cargo.toml)
    if p.join("Cargo.toml").exists() || p.join("hernest-ide/core/Cargo.toml").exists() {
        let manifest_path = if p.join("Cargo.toml").exists() {
            p.join("Cargo.toml").to_string_lossy().to_string()
        } else {
            p.join("hernest-ide/core/Cargo.toml").to_string_lossy().to_string()
        };

        if let Ok(output) = Command::new("cargo")
            .args(["check", "--message-format=json", "--manifest-path", &manifest_path])
            .current_dir(root_dir)
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Ok(val) = serde_json::from_str::<Value>(line) {
                    if val["reason"] == "compiler-message" {
                        if let Some(msg) = val.get("message") {
                            let level = msg["level"].as_str().unwrap_or("warning");
                            let text = msg["message"].as_str().unwrap_or("");
                            let spans = msg["spans"].as_array();
                            let (file_name, line_num, col_start, col_end) = if let Some(first_span) = spans.and_then(|s| s.first()) {
                                (
                                    first_span["file_name"].as_str().unwrap_or(""),
                                    first_span["line_start"].as_u64().unwrap_or(1),
                                    first_span["column_start"].as_u64().unwrap_or(1),
                                    first_span["column_end"].as_u64().unwrap_or(1)
                                )
                            } else {
                                ("", 1, 1, 1)
                            };

                            diagnostics.push(serde_json::json!({
                                "severity": level,
                                "message": text,
                                "file": file_name,
                                "line": line_num,
                                "column": col_start,
                                "end_column": col_end,
                                "source": "rustc"
                            }));
                        }
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "diagnostics": diagnostics,
        "count": diagnostics.len()
    }))
}

