import re
import sys
import os
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional

class DangerousCommandError(Exception):
    pass

class TerminalExecutionError(Exception):
    pass

# Motifs strictement interdits (destruction de données / attaque système)
DANGEROUS_PATTERNS: List[re.Pattern] = [
    re.compile(r"\brmdir\s+/[sS]", re.IGNORECASE),
    re.compile(r"\brd\s+/[sS]", re.IGNORECASE),
    re.compile(r"\bdel\s+.*(/[fF]|/[sS]|/[qQ])", re.IGNORECASE),
    re.compile(r"\bRemove-Item\s+.*(-Recurse|-Force)", re.IGNORECASE),
    re.compile(r"\bformat\s+[a-zA-Z]:", re.IGNORECASE),
    re.compile(r"\bdiskpart\b", re.IGNORECASE),
    re.compile(r"\bmkfs\b", re.IGNORECASE),
    re.compile(r"\bshutdown\b", re.IGNORECASE),
    re.compile(r"\bStop-Computer\b", re.IGNORECASE),
    re.compile(r"\breg\s+delete\b", re.IGNORECASE),
    re.compile(r"\btakeown\b", re.IGNORECASE),
    re.compile(r"\bicacls\s+.*(/grant|/deny|/setowner)", re.IGNORECASE),
    re.compile(r":\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;", re.IGNORECASE), # Fork bomb bash
    re.compile(r"\brm\s+-[rR]*f\s+/\b", re.IGNORECASE), # rm -rf /
]

# Motifs sensibles requérant une validation explicite de l'utilisateur (Human-In-The-Loop)
SENSITIVE_PATTERNS: List[re.Pattern] = [
    re.compile(r"\b(Remove-Item|rm|del|erase)\b", re.IGNORECASE),
    re.compile(r"\b(Move-Item|mv|move)\b", re.IGNORECASE),
    re.compile(r"\b(kill|Stop-Process|taskkill)\b", re.IGNORECASE),
    re.compile(r"\b(New-Item|mkdir|md)\b", re.IGNORECASE),
    re.compile(r"\b(Set-Content|Out-File|Add-Content)\b", re.IGNORECASE),
    re.compile(r"\b(git\s+(commit|push|reset|checkout|branch))\b", re.IGNORECASE),
    re.compile(r"\b(pip\s+(install|uninstall))\b", re.IGNORECASE),
]

def is_sensitive_command(command: str) -> bool:
    """Détecte si la commande a un impact potentiel sur le système et nécessite une approbation."""
    return any(p.search(command) for p in SENSITIVE_PATTERNS)

def check_command_safety(command: str) -> None:
    """Vérifie si la commande contient des patterns interdits et lève une exception le cas échéant."""
    for pattern in DANGEROUS_PATTERNS:
        if pattern.search(command):
            raise DangerousCommandError(f"Commande bloquée par les garde-fous de sécurité: '{command}'")

def execute_terminal(
    command: str,
    cwd: Optional[str] = None,
    timeout_sec: int = 30
) -> Dict[str, Any]:
    """
    Exécute une commande de terminal dans le répertoire de travail spécifié (projet).
    Valide les règles de sécurité avant tout lancement.
    """
    check_command_safety(command)

    working_dir = cwd if (cwd and Path(cwd).exists()) else str(Path.cwd())

    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"

        if sys.platform == "win32":
            # Si le modèle a lui-même préfixé la commande par powershell ..., on extrait la sous-commande
            clean_cmd = command.strip()
            if re.match(r'^powershell(\.exe)?\s+(-[a-zA-Z]+\s+)*(-Command|-c)\s+', clean_cmd, re.IGNORECASE):
                # Retirer le préfixe powershell ... -Command
                sub = re.sub(r'^powershell(\.exe)?\s+(-[a-zA-Z]+\s+)*(-Command|-c)\s+', '', clean_cmd, flags=re.IGNORECASE).strip()
                if (sub.startswith('"') and sub.endswith('"')) or (sub.startswith("'") and sub.endswith("'")):
                    sub = sub[1:-1]
                clean_cmd = sub

            # Détection automatique : si la commande contient des cmdlets PowerShell ou des pipes/syntaxes PS,
            # on exécute via powershell.exe, sinon via cmd.exe
            ps_indicators = ["Get-", "Set-", "Select-", "Format-", "Where-", "New-", "$", "|", "Measure-", "Test-", "gci", "ls"]
            use_powershell = any(ind in clean_cmd for ind in ps_indicators) or clean_cmd.startswith(("ls ", "cat ", "pwd"))

            if use_powershell:
                cmd = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", clean_cmd]
            else:
                cmd = ["cmd.exe", "/c", clean_cmd]

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
        else:
            res = subprocess.run(
                command,
                shell=True,
                cwd=working_dir,
                capture_output=True,
                text=True,
                timeout=timeout_sec
            )
        return {
            "exit_code": res.returncode,
            "stdout": res.stdout,
            "stderr": res.stderr
        }
    except subprocess.TimeoutExpired as exc:
        raise TerminalExecutionError(f"La commande a dépassé le délai imparti de {timeout_sec}s.") from exc
    except Exception as exc:
        raise TerminalExecutionError(f"Erreur d'exécution terminal: {exc}") from exc

