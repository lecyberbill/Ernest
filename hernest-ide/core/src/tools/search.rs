use std::path::PathBuf;
use ignore::WalkBuilder;
use regex::Regex;
use serde_json::Value;

pub fn grep_search(root_path: &str, query: &str, max_results: Option<usize>) -> Result<Value, String> {
    let re = Regex::new(query).map_err(|e| format!("Regex invalide '{}': {}", query, e))?;
    let limit = max_results.unwrap_or(50);
    let mut matches = Vec::new();

    let walker = WalkBuilder::new(root_path)
        .hidden(true)
        .git_ignore(true)
        .build();

    for result in walker {
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };

        if entry.file_type().map_or(false, |ft| ft.is_file()) {
            let path = entry.path();
            if let Ok(content) = std::fs::read_to_string(path) {
                for (line_idx, line) in content.lines().enumerate() {
                    if re.is_match(line) {
                        matches.push(serde_json::json!({
                            "file": path.to_string_lossy().to_string(),
                            "line": line_idx + 1,
                            "text": line.trim()
                        }));
                        if matches.len() >= limit {
                            break;
                        }
                    }
                }
            }
        }
        if matches.len() >= limit {
            break;
        }
    }

    Ok(serde_json::json!({
        "query": query,
        "count": matches.len(),
        "matches": matches
    }))
}

pub fn list_directory_entries(dir_path: &str) -> Result<Value, String> {
    let p = std::path::Path::new(dir_path);
    if !p.exists() {
        return Err(format!("Dossier introuvable: {}", dir_path));
    }
    if !p.is_dir() {
        return Err(format!("Le chemin n'est pas un dossier: {}", dir_path));
    }

    let read_dir = std::fs::read_dir(p)
        .map_err(|e| format!("Impossible de lire le dossier {}: {}", dir_path, e))?;

    let mut entries = Vec::new();
    for item in read_dir.flatten() {
        let fpath = item.path();
        let fname = item.file_name().to_string_lossy().to_string();

        // Ignorer les répertoires lourds ou de build
        if fname == ".git" || fname == "target" || fname == "node_modules" {
            continue;
        }

        let is_dir = item.file_type().map_or(false, |ft| ft.is_dir());
        entries.push(serde_json::json!({
            "name": fname,
            "path": fpath.to_string_lossy().to_string().replace('\\', "/"),
            "is_dir": is_dir
        }));
    }

    // Tri alphabétique (dossiers en premier)
    entries.sort_by(|a, b| {
        let a_dir = a["is_dir"].as_bool().unwrap_or(false);
        let b_dir = b["is_dir"].as_bool().unwrap_or(false);
        if a_dir && !b_dir {
            std::cmp::Ordering::Less
        } else if !a_dir && b_dir {
            std::cmp::Ordering::Greater
        } else {
            a["name"].as_str().unwrap_or("").to_lowercase().cmp(&b["name"].as_str().unwrap_or("").to_lowercase())
        }
    });

    Ok(serde_json::json!({
        "dir": dir_path.replace('\\', "/"),
        "entries": entries
    }))
}

pub fn list_files(root_path: &str, max_depth: Option<usize>) -> Result<Value, String> {
    let mut builder = WalkBuilder::new(root_path);
    builder.hidden(false).git_ignore(true);
    if let Some(depth) = max_depth {
        builder.max_depth(Some(depth));
    }

    let mut files = Vec::new();
    for result in builder.build() {
        if let Ok(entry) = result {
            let path = entry.path();
            if path == std::path::Path::new(root_path) {
                continue;
            }
            let is_dir = entry.file_type().map_or(false, |ft| ft.is_dir());
            let fname = entry.file_name().to_string_lossy().to_string();
            // Filtrer les dossiers internes volumineux si jamais ignorés
            if fname == ".git" || fname == "target" || fname == "node_modules" {
                continue;
            }
            files.push(serde_json::json!({
                "path": path.to_string_lossy().to_string().replace('\\', "/"),
                "name": fname,
                "is_dir": is_dir,
                "depth": entry.depth()
            }));
            if files.len() >= 1000 {
                break;
            }
        }
    }

    Ok(serde_json::json!({
        "root": root_path.replace('\\', "/"),
        "total": files.len(),
        "files": files
    }))
}

