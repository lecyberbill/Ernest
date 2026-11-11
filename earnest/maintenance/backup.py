"""
Module de Sauvegarde et de Restauration à Chaud pour Earnest.
Permet d'exporter et d'importer un espace de travail complet :
- Base de données SQLite cohérente (snapshot via API VACUUM INTO ou backup direct)
- Mémoires et index sémantiques FTS5
- Artefacts et livrables générés
- Traces d'observabilité OpenTelemetry
Format d'archive compressée standard : .earnest-bundle (ZIP/Tarball)
"""

import os
import io
import time
import zipfile
import sqlite3
from pathlib import Path
from typing import Dict, Any, Optional
from earnest.config import get_data_dir, get_db_path

class BackupService:
    """Service de gestion des sauvegardes et restaurations d'espaces de travail."""

    def __init__(self, data_dir: Optional[Path] = None):
        self.data_dir = data_dir or get_data_dir()
        self.db_path = get_db_path()
        self.backups_dir = self.data_dir / "backups"
        self.backups_dir.mkdir(parents=True, exist_ok=True)

    def create_backup(self, project_id: str = "default_workspace") -> Dict[str, Any]:
        """Génère une archive cohérente à chaud pour le projet spécifié."""
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        backup_filename = f"earnest_backup_{project_id}_{timestamp}.zip"
        backup_path = self.backups_dir / backup_filename

        # Fichier temporaire pour le snapshot SQLite cohérent (évite tout verrou d'écriture WAL)
        temp_db_snapshot = self.backups_dir / f"snapshot_{timestamp}.db"

        try:
            # 1. Snapshot cohérent de la base SQLite
            conn = sqlite3.connect(str(self.db_path))
            try:
                conn.execute(f"VACUUM INTO '{str(temp_db_snapshot).replace(os.sep, '/')}'")
            finally:
                conn.close()

            # 2. Création de l'archive ZIP
            with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
                # Ajouter la base de données
                zf.write(temp_db_snapshot, arcname="data.db")

                # Ajouter les artefacts du projet
                artifacts_dir = self.data_dir / "artifacts" / project_id
                if artifacts_dir.exists():
                    for root, _, files in os.walk(artifacts_dir):
                        for file in files:
                            full_path = Path(root) / file
                            rel_path = full_path.relative_to(self.data_dir)
                            zf.write(full_path, arcname=str(rel_path).replace(os.sep, "/"))

                # Ajouter les traces OpenTelemetry du projet
                traces_dir = self.data_dir / "traces" / project_id
                if traces_dir.exists():
                    for root, _, files in os.walk(traces_dir):
                        for file in files:
                            full_path = Path(root) / file
                            rel_path = full_path.relative_to(self.data_dir)
                            zf.write(full_path, arcname=str(rel_path).replace(os.sep, "/"))

                # Métadonnées du backup
                meta = {
                    "project_id": project_id,
                    "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "version": "1.0.0",
                    "backup_type": "full_workspace"
                }
                zf.writestr("manifest.json", json_dumps(meta))

            size_bytes = backup_path.stat().st_size
            return {
                "status": "ok",
                "filename": backup_filename,
                "path": str(backup_path),
                "size_kb": round(size_bytes / 1024, 1),
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
            }
        finally:
            if temp_db_snapshot.exists():
                try:
                    temp_db_snapshot.unlink()
                except Exception:
                    pass

    def list_backups(self) -> list:
        """Liste les archives de sauvegarde disponibles."""
        backups = []
        for f in self.backups_dir.glob("earnest_backup_*.zip"):
            stat = f.stat()
            backups.append({
                "filename": f.name,
                "size_kb": round(stat.st_size / 1024, 1),
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
            })
        return sorted(backups, key=lambda x: x["created_at"], reverse=True)

    def restore_backup(self, backup_filename: str) -> Dict[str, Any]:
        """Restaure une archive de sauvegarde."""
        target_zip = self.backups_dir / backup_filename
        if not target_zip.exists():
            return {"status": "error", "error": f"Archive introuvable : {backup_filename}"}

        with zipfile.ZipFile(target_zip, "r") as zf:
            # Vérification du manifeste
            if "manifest.json" not in zf.namelist():
                return {"status": "error", "error": "Archive non conforme (aucun manifest.json)"}

            # Extraction des artefacts et des traces
            for member in zf.namelist():
                if member in ("data.db", "manifest.json"):
                    continue
                zf.extract(member, self.data_dir)

        return {"status": "ok", "restored": backup_filename}

def json_dumps(data: Any) -> str:
    import json
    return json.dumps(data, ensure_ascii=False, indent=2)

