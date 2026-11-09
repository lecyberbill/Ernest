use std::process::{Command, Stdio, Child};
use std::io::{Write, BufReader, BufRead};
use serde_json::Value;

pub struct McpClient {
    command: String,
    args: Vec<String>,
}

impl McpClient {
    pub fn new(command: &str, args: &[String]) -> Self {
        Self {
            command: command.to_string(),
            args: args.to_vec(),
        }
    }

    pub fn call_tool(&self, tool_name: &str, arguments: &Value) -> Result<Value, String> {
        let mut child = Command::new(&self.command)
            .args(&self.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Impossible de démarrer le serveur MCP ({}): {}", self.command, e))?;

        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        });

        if let Some(mut stdin) = child.stdin.take() {
            writeln!(stdin, "{}", request.to_string()).map_err(|e| e.to_string())?;
        }

        let output = child.wait_with_output().map_err(|e| e.to_string())?;
        let stdout_str = String::from_utf8_lossy(&output.stdout);

        let line = stdout_str.lines().find(|l| l.contains("\"jsonrpc\"")).unwrap_or(stdout_str.trim());
        let val: Value = serde_json::from_str(line).map_err(|e| format!("Erreur décodage JSON-RPC: {} (raw: {})", e, stdout_str))?;

        if let Some(err) = val.get("error") {
            return Err(err.to_string());
        }

        Ok(val.get("result").cloned().unwrap_or(serde_json::json!({})))
    }
}

