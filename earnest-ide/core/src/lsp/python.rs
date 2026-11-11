use std::process::{Command, Stdio};
use std::io::Write;
use serde_json::Value;

pub struct PythonLspWorker {
    interpreter_path: String,
}

impl PythonLspWorker {
    pub fn new(interpreter_path: Option<String>) -> Self {
        let path = interpreter_path.unwrap_or_else(|| "python".to_string());
        Self { interpreter_path: path }
    }

    pub fn handle_request(&self, method: &str, params: &Value) -> Result<Value, String> {
        let script_bridge = concat!(
            r#"
import sys, json
try:
    import jedi
except ImportError:
    jedi = None

def run():
    line = sys.stdin.readline()
    if not line: return
    try:
        req = json.loads(line)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return
    
    method = req.get("method")
    params = req.get("params", {})
    code = params.get("code", "")
    path = params.get("path", "script.py")
    line_num = params.get("line", 1)
    col_num = params.get("column", 1)

    if jedi is None:
        print(json.dumps({"error": "jedi not installed in Python environment"}))
        return

    try:
        script = jedi.Script(code, path=path)
        if method == "complete":
            comps = script.complete(line_num, col_num)
            items = []
            for c in comps[:60]:
                doc = ""
                try: doc = c.docstring()
                except Exception: pass
                items.append({
                    "label": c.name,
                    "kind": c.type,
                    "detail": c.description,
                    "doc": doc
                })
            print(json.dumps({"result": {"items": items}}))
        elif method == "hover":
            helps = script.help(line_num, col_num)
            contents = []
            for h in helps:
                doc = ""
                try: doc = h.docstring()
                except Exception: pass
                contents.append(f"```python\n{h.description}\n```\n{doc}")
            print(json.dumps({"result": {"contents": contents}}))
        elif method == "definition":
            defs = script.goto(line_num, col_num)
            results = []
            for d in defs:
                mod_path = str(d.module_path) if d.module_path else path
                results.append({
                    "file": mod_path,
                    "line": d.line or 1,
                    "column": d.column or 1
                })
            print(json.dumps({"result": {"definitions": results}}))
        elif method == "signatures":
            sigs = script.get_signatures(line_num, col_num)
            signatures_list = []
            for s in sigs:
                signatures_list.append({
                    "label": s.to_string(),
                    "activeParameter": s.index or 0,
                    "parameters": [p.name for p in s.params]
                })
            print(json.dumps({"result": {"signatures": signatures_list}}))
        else:
            print(json.dumps({"error": f"Unsupported method: {method}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == '__main__':
    run()
"#
        );

        let mut child = Command::new(&self.interpreter_path)
            .args(["-c", script_bridge])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Impossible de lancer Python ({:?}): {}", self.interpreter_path, e))?;

        let req_json = serde_json::json!({
            "method": method,
            "params": params
        }).to_string();

        if let Some(mut stdin) = child.stdin.take() {
            writeln!(stdin, "{}", req_json).map_err(|e| e.to_string())?;
        }

        let output = child.wait_with_output().map_err(|e| e.to_string())?;
        let stdout_str = String::from_utf8_lossy(&output.stdout);

        if stdout_str.trim().is_empty() {
            let stderr_str = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Python LSP vide. Erreur: {}", stderr_str));
        }

        let parsed: Value = serde_json::from_str(stdout_str.trim())
            .map_err(|e| format!("Erreur décodage JSON Python LSP: {} (raw: {})", e, stdout_str))?;

        if let Some(err) = parsed.get("error") {
            return Err(err.as_str().unwrap_or("Erreur inconnue").to_string());
        }

        Ok(parsed.get("result").cloned().unwrap_or(serde_json::json!({})))
    }
}
