import sys
import os
import tempfile
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any, Optional

class SandboxExecutionError(Exception):
    pass

class SandboxTimeoutError(SandboxExecutionError):
    pass

def execute_in_sandbox(
    runtime: str,
    code: str,
    timeout_sec: int = 20,
    cwd: Optional[str] = None
) -> Dict[str, Any]:
    """
    Exécute un script éphémère (python, bash/powershell, node) dans un dossier temporaire confiné.
    Retourne stdout, stderr et le code de sortie.
    Lève SandboxTimeoutError ou SandboxExecutionError en cas d'échec d'exécution système.
    """
    if runtime not in ("python", "bash", "node"):
        raise ValueError(f"Runtime '{runtime}' non supporté. Valeurs acceptées: python, bash, node.")

    sandbox_dir = tempfile.mkdtemp(prefix="agent_sandbox_")
    try:
        working_dir = cwd if cwd and Path(cwd).exists() else sandbox_dir
        
        if runtime == "python":
            script_path = Path(sandbox_dir) / "script.py"
            script_path.write_text(code, encoding="utf-8")
            cmd = [sys.executable, str(script_path)]
        elif runtime == "node":
            script_path = Path(sandbox_dir) / "script.js"
            script_path.write_text(code, encoding="utf-8")
            cmd = ["node", str(script_path)]
        elif runtime == "bash":
            if sys.platform == "win32":
                # Vérifier si bash est dispo (Git bash ou WSL), sinon powershell confiné
                bash_cmd = shutil.which("bash")
                if bash_cmd:
                    script_path = Path(sandbox_dir) / "script.sh"
                    script_path.write_text(code, encoding="utf-8")
                    cmd = [bash_cmd, str(script_path)]
                else:
                    script_path = Path(sandbox_dir) / "script.ps1"
                    script_path.write_text(code, encoding="utf-8")
                    cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script_path)]
            else:
                script_path = Path(sandbox_dir) / "script.sh"
                script_path.write_text(code, encoding="utf-8")
                cmd = ["/bin/bash", str(script_path)]

        try:
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            env["PYTHONUTF8"] = "1"

            res = subprocess.run(
                cmd,
                cwd=working_dir,
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_sec
            )
            return {
                "exit_code": res.returncode,
                "stdout": res.stdout,
                "stderr": res.stderr
            }
        except subprocess.TimeoutExpired as exc:
            raise SandboxTimeoutError(f"Le script a dépassé le délai de {timeout_sec}s.") from exc
        except FileNotFoundError as exc:
            raise SandboxExecutionError(f"L'interpréteur pour '{runtime}' est introuvable sur le système.") from exc
        except Exception as exc:
            raise SandboxExecutionError(f"Erreur d'exécution de la sandbox: {str(exc)}") from exc
    finally:
        # Nettoyage résistant sous Windows (évite les verrous transitoires WinError 32)
        shutil.rmtree(sandbox_dir, ignore_errors=True)

