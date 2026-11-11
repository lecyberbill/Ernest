use std::process::Command;
use std::time::Duration;
use serde_json::Value;

// Liste des commandes strictement interdites pour garantir l'intégrité de l'hôte
const FORBIDDEN_PATTERNS: &[&str] = &[
    "format ", "format.com", "diskpart",
    "rmdir /s /q c:\\", "rmdir /s /q c:/",
    "remove-item -recurse -force c:\\", "remove-item -recurse -force c:/",
    ":(){ :|:& };:", "del /f /s /q c:\\windows",
];

pub fn is_forbidden(command: &str) -> bool {
    let lower = command.to_lowercase();
    FORBIDDEN_PATTERNS.iter().any(|pat| lower.contains(pat))
}

pub fn execute_terminal(command: &str, timeout_secs: u64) -> Result<Value, String> {
    execute_terminal_in_dir(command, timeout_secs, None)
}

pub fn execute_terminal_in_dir(command: &str, _timeout_secs: u64, cwd: Option<&std::path::Path>) -> Result<Value, String> {
    if is_forbidden(command) {
        return Err(format!("Commande bloquée par les garde-fous de sécurité : '{}'", command));
    }

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("powershell");
        c.args(["-NoProfile", "-NonInteractive", "-Command", command]);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.args(["-c", command]);
        c
    };

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    let start = std::time::Instant::now();
    let output = cmd.output().map_err(|e| format!("Échec du lancement du sous-processus : {}", e))?;
    let duration_ms = start.elapsed().as_millis();

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    Ok(serde_json::json!({
        "status": if exit_code == 0 { "success" } else { "error" },
        "exit_code": exit_code,
        "stdout": stdout,
        "stderr": stderr,
        "duration_ms": duration_ms
    }))
}

