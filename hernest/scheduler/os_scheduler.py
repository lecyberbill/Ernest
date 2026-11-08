import sys
import subprocess
from typing import Dict, Any, List
from pathlib import Path

class OSSchedulerError(Exception):
    pass

class OSScheduler:
    """
    Gestionnaire d'ordonnancement sans démon permanent.
    Délègue directement à l'OS (schtasks sur Windows, crontab sur Linux/macOS).
    """

    @staticmethod
    def sync_task(task_id: str, cron_expr: str, agent_cmd: str) -> Dict[str, Any]:
        """
        Déclare ou met à jour la tâche dans l'OS.
        """
        if sys.platform == "win32":
            return OSScheduler._sync_windows_task(task_id, cron_expr, agent_cmd)
        else:
            return OSScheduler._sync_unix_cron(task_id, cron_expr, agent_cmd)

    @staticmethod
    def remove_task(task_id: str) -> Dict[str, Any]:
        if sys.platform == "win32":
            return OSScheduler._remove_windows_task(task_id)
        else:
            return OSScheduler._remove_unix_cron(task_id)

    @staticmethod
    def _sync_windows_task(task_id: str, cron_expr: str, agent_cmd: str) -> Dict[str, Any]:
        # Nom de tâche unique dans schtasks
        task_name = f"Hernest_{task_id}"
        
        # Interprétation simple du cron (ex: "0 2 * * *" -> DAILY à 02:00)
        # Format schtasks standard: /SC DAILY /ST HH:MM
        parts = cron_expr.strip().split()
        if len(parts) != 5:
            raise ValueError(f"Format cron invalide (attendu 5 segments): '{cron_expr}'")
        
        minute, hour = parts[0], parts[1]
        hh = f"{int(hour):02d}" if hour.isdigit() else "00"
        mm = f"{int(minute):02d}" if minute.isdigit() else "00"
        start_time = f"{hh}:{mm}"

        cmd = [
            "schtasks.exe", "/Create",
            "/TN", task_name,
            "/TR", agent_cmd,
            "/SC", "DAILY",
            "/ST", start_time,
            "/F"
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise OSSchedulerError(f"Erreur schtasks /Create: {res.stderr or res.stdout}")
        return {"status": "synced", "system": "schtasks", "task_name": task_name}

    @staticmethod
    def _remove_windows_task(task_id: str) -> Dict[str, Any]:
        task_name = f"Hernest_{task_id}"
        cmd = ["schtasks.exe", "/Delete", "/TN", task_name, "/F"]
        res = subprocess.run(cmd, capture_output=True, text=True)
        return {"status": "removed", "system": "schtasks", "task_name": task_name, "returncode": res.returncode}

    @staticmethod
    def _sync_unix_cron(task_id: str, cron_expr: str, agent_cmd: str) -> Dict[str, Any]:
        # Lire la crontab existante
        tag = f"# HERNEST_TASK_{task_id}"
        entry = f"{cron_expr} {agent_cmd} {tag}"
        
        res = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
        existing = res.stdout if res.returncode == 0 else ""
        lines = [line for line in existing.splitlines() if tag not in line]
        lines.append(entry)
        new_crontab = "\n".join(lines) + "\n"
        
        write_res = subprocess.run(["crontab", "-"], input=new_crontab, text=True, capture_output=True)
        if write_res.returncode != 0:
            raise OSSchedulerError(f"Erreur crontab: {write_res.stderr}")
        return {"status": "synced", "system": "crontab", "task_id": task_id}

    @staticmethod
    def _remove_unix_cron(task_id: str) -> Dict[str, Any]:
        tag = f"# HERNEST_TASK_{task_id}"
        res = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
        if res.returncode != 0:
            return {"status": "not_found", "task_id": task_id}
        lines = [line for line in res.stdout.splitlines() if tag not in line]
        new_crontab = "\n".join(lines) + "\n"
        subprocess.run(["crontab", "-"], input=new_crontab, text=True, capture_output=True)
        return {"status": "removed", "system": "crontab", "task_id": task_id}

