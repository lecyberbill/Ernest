use std::fs;
use std::path::{Path, PathBuf};
use serde_json::Value;

pub fn read_file(path_str: &str, start_line: Option<usize>, end_line: Option<usize>) -> Result<Value, String> {
    let path = PathBuf::from(path_str);
    if !path.exists() {
        return Err(format!("Fichier introuvable: {}", path_str));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Impossible de lire le fichier {}: {}", path_str, e))?;

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    let start = start_line.unwrap_or(1).max(1);
    let end = end_line.unwrap_or(total_lines).min(total_lines);

    if start > total_lines {
        return Ok(serde_json::json!({
            "path": path_str,
            "total_lines": total_lines,
            "lines": "",
            "truncated": false
        }));
    }

    let selected_lines: Vec<String> = lines[(start - 1)..end]
        .iter()
        .enumerate()
        .map(|(idx, line)| format!("{:4} | {}", start + idx, line))
        .collect();

    Ok(serde_json::json!({
        "path": path_str,
        "start_line": start,
        "end_line": end,
        "total_lines": total_lines,
        "content": selected_lines.join("\n")
    }))
}

pub fn write_file(path_str: &str, content: &str) -> Result<Value, String> {
    use std::io::Write;
    let path = PathBuf::from(path_str);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Erreur création répertoires parents: {}", e))?;
    }

    // Écriture atomique sécurisée : fichier temporaire .tmp -> flush -> rename
    let tmp_path = format!("{}.tmp.{}", path_str, &uuid::Uuid::new_v4().to_string().replace('-', "")[..6]);
    {
        let mut file = fs::File::create(&tmp_path)
            .map_err(|e| format!("Erreur création fichier temporaire {}: {}", tmp_path, e))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("Erreur écriture dans fichier temporaire {}: {}", tmp_path, e))?;
        file.sync_all()
            .map_err(|e| format!("Erreur sync disque fichier {}: {}", tmp_path, e))?;
    }

    // Remplacement atomique du fichier de destination
    if let Err(err) = fs::rename(&tmp_path, &path) {
        // Fallback sous Windows si le fichier est verrouillé ou écriture directe
        if let Err(e2) = fs::write(&path, content) {
            fs::remove_file(&tmp_path).ok();
            return Err(format!("Erreur écriture finale fichier {}: {} (fallback: {})", path_str, err, e2));
        }
        fs::remove_file(&tmp_path).ok();
    }

    Ok(serde_json::json!({
        "status": "success",
        "path": path_str,
        "bytes_written": content.len()
    }))
}

pub fn edit_file(path_str: &str, target: &str, replacement: &str) -> Result<Value, String> {
    let path = PathBuf::from(path_str);
    if !path.exists() {
        return Err(format!("Fichier introuvable: {}", path_str));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Impossible de lire le fichier {}: {}", path_str, e))?;

    let count = content.matches(target).count();
    if count == 0 {
        return Err("Le texte cible (target) est introuvable dans le fichier. Assurez-vous d'inclure l'indentation et les sauts de ligne exacts.".to_string());
    }

    let new_content = content.replace(target, replacement);
    write_file(path_str, &new_content)
}

pub fn rename_file_or_dir(old_path_str: &str, new_path_str: &str) -> Result<Value, String> {
    let old_p = PathBuf::from(old_path_str);
    let new_p = PathBuf::from(new_path_str);
    if !old_p.exists() {
        return Err(format!("Chemin source introuvable: {}", old_path_str));
    }
    if let Some(parent) = new_p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Erreur création répertoires cibles: {}", e))?;
    }
    fs::rename(&old_p, &new_p).map_err(|e| format!("Erreur renommage {} -> {}: {}", old_path_str, new_path_str, e))?;
    Ok(serde_json::json!({
        "status": "success",
        "old_path": old_path_str,
        "new_path": new_path_str
    }))
}

pub fn delete_file_or_dir(path_str: &str) -> Result<Value, String> {
    let path = PathBuf::from(path_str);
    if !path.exists() {
        return Err(format!("Fichier ou dossier introuvable: {}", path_str));
    }
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("Erreur suppression dossier {}: {}", path_str, e))?;
    } else {
        fs::remove_file(&path).map_err(|e| format!("Erreur suppression fichier {}: {}", path_str, e))?;
    }
    Ok(serde_json::json!({
        "status": "success",
        "deleted_path": path_str
    }))
}

pub fn create_directory(path_str: &str) -> Result<Value, String> {
    let path = PathBuf::from(path_str);
    fs::create_dir_all(&path).map_err(|e| format!("Erreur création dossier {}: {}", path_str, e))?;
    Ok(serde_json::json!({
        "status": "success",
        "path": path_str
    }))
}


