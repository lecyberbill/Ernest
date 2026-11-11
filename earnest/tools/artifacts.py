import os
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional
from earnest.config import get_data_dir

def get_artifacts_dir(project_id: str) -> Path:
    """Retourne le dossier d'artefacts dédié à un projet."""
    art_dir = get_data_dir() / "artifacts" / project_id
    art_dir.mkdir(parents=True, exist_ok=True)
    return art_dir

def create_artifact(
    project_id: str,
    title: str,
    content: str,
    artifact_type: str = "markdown",
    file_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Crée un artefact et le matérialise sur le disque.
    Si file_path est fourni (ex: D:\\Projet\\Earnest\\output.html), le fichier y est matérialisé directement.
    Sinon, il est stocké dans le magasin d'artefacts d'Earnest (~/.local/share/agent-manager/artifacts/{project_id}/).
    """
    art_id = f"art_{uuid.uuid4().hex[:10]}"
    
    # Extension selon le type
    ext_map = {
        "markdown": ".md",
        "html": ".html",
        "svg": ".svg",
        "json": ".json",
        "python": ".py",
        "shell": ".sh",
        "text": ".txt"
    }
    ext = ext_map.get(artifact_type.lower(), ".txt")

    if file_path:
        target_path = Path(file_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        # Également créer une copie miroir dans le magasin d'artefacts du projet
        # pour qu'il soit immédiatement visible dans la galerie UI
        clean_name = target_path.name
        mirror_path = get_artifacts_dir(project_id) / f"{target_path.stem}_{art_id}{target_path.suffix}"
        mirror_path.write_text(content, encoding="utf-8")
    else:
        # Nom de fichier normalisé
        clean_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in title.lower())
        target_path = get_artifacts_dir(project_id) / f"{clean_name}_{art_id}{ext}"

    target_path.write_text(content, encoding="utf-8")

    return {
        "status": "created",
        "artifact_id": art_id,
        "title": title,
        "artifact_type": artifact_type,
        "file_path": str(target_path.resolve()),
        "size_bytes": len(content.encode("utf-8"))
    }

