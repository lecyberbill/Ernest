use std::process::Command;
use serde_json::Value;

pub fn get_git_status(root_dir: &str) -> Result<Value, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain=v1", "-b"])
        .current_dir(root_dir)
        .output()
        .map_err(|e| format!("Erreur exécution git status: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Git error: {}", err));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut branch = String::from("detached");
    let mut files = Vec::new();

    for line in stdout.lines() {
        if line.starts_with("##") {
            // Extraction de la branche
            let branch_line = line.trim_start_matches("##").trim();
            if let Some(b) = branch_line.split("...").next() {
                branch = b.trim().to_string();
            }
        } else if line.len() >= 3 {
            let status_code = &line[0..2];
            let file_path = line[3..].trim().to_string();
            let state_str = match status_code.trim() {
                "M" => "modified",
                "A" => "added",
                "D" => "deleted",
                "??" => "untracked",
                "R" => "renamed",
                _ => "changed",
            };
            files.push(serde_json::json!({
                "path": file_path,
                "status": state_str,
                "raw_code": status_code.trim()
            }));
        }
    }

    Ok(serde_json::json!({
        "branch": branch,
        "files": files,
        "count": files.len()
    }))
}

pub fn get_git_diff(root_dir: &str, file_path: Option<&str>) -> Result<Value, String> {
    let mut cmd = Command::new("git");
    cmd.args(["diff", "HEAD"]);
    if let Some(fp) = file_path {
        if !fp.is_empty() {
            cmd.arg("--").arg(fp);
        }
    }
    cmd.current_dir(root_dir);

    let output = cmd.output().map_err(|e| format!("Erreur git diff: {}", e))?;
    let diff_text = String::from_utf8_lossy(&output.stdout).to_string();

    Ok(serde_json::json!({
        "file": file_path,
        "diff": diff_text
    }))
}

pub fn git_commit(root_dir: &str, message: &str) -> Result<Value, String> {
    // 1. git add -A
    let add_out = Command::new("git")
        .args(["add", "-A"])
        .current_dir(root_dir)
        .output()
        .map_err(|e| format!("Erreur git add: {}", e))?;

    if !add_out.status.success() {
        return Err(String::from_utf8_lossy(&add_out.stderr).to_string());
    }

    // 2. git commit -m
    let commit_out = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(root_dir)
        .output()
        .map_err(|e| format!("Erreur git commit: {}", e))?;

    let stdout = String::from_utf8_lossy(&commit_out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&commit_out.stderr).to_string();

    if commit_out.status.success() {
        Ok(serde_json::json!({
            "status": "success",
            "output": stdout
        }))
    } else {
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

