import os
import sys
from pathlib import Path

def get_data_dir() -> Path:
    """Retourne le répertoire ~/.local/share/agent-manager/."""
    home = Path.home()
    data_dir = home / ".local" / "share" / "agent-manager"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir

def get_db_path() -> Path:
    """Retourne le chemin absolu de data.db."""
    return get_data_dir() / "data.db"

