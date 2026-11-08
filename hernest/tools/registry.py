import json
import sqlite3
import uuid
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional
from hernest.config import get_data_dir
from hernest.tools.sandbox import execute_in_sandbox

class ToolRegistryService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.tools_dir = get_data_dir() / "custom_tools"
        self.tools_dir.mkdir(parents=True, exist_ok=True)

    def register_tool(
        self,
        name: str,
        description: str,
        schema_json: str,
        code: str,
        runtime: str,
        is_auto_generated: int = 0
    ) -> Dict[str, Any]:
        """
        Sauvegarde le script sur le disque et l'enregistre dans la table tools.
        """
        if runtime not in ("python", "bash", "node"):
            raise ValueError(f"Runtime '{runtime}' non supporté.")
        
        # Validation du JSON Schema
        try:
            parsed_schema = json.loads(schema_json) if isinstance(schema_json, str) else schema_json
        except Exception as e:
            raise ValueError(f"schema_json invalide: {e}")

        tool_id = f"tool_{uuid.uuid4().hex[:12]}"
        ext = ".py" if runtime == "python" else (".js" if runtime == "node" else ".sh")
        entrypoint_path = self.tools_dir / f"{name}{ext}"
        entrypoint_path.write_text(code, encoding="utf-8")

        normalized_schema_json = json.dumps(parsed_schema, ensure_ascii=False)
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO tools (id, name, description, schema_json, execution_type, entrypoint, is_enabled, is_auto_generated)
                VALUES (?, ?, ?, ?, 'script', ?, 1, ?)
                ON CONFLICT(name) DO UPDATE SET
                    description = excluded.description,
                    schema_json = excluded.schema_json,
                    entrypoint = excluded.entrypoint,
                    is_enabled = 1,
                    is_auto_generated = excluded.is_auto_generated
                """,
                (tool_id, name, description, normalized_schema_json, str(entrypoint_path), is_auto_generated)
            )

        return {
            "status": "success",
            "tool_id": tool_id,
            "name": name,
            "entrypoint": str(entrypoint_path)
        }

    def list_active_tools(self) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        rows = cursor.execute(
            """
            SELECT id, name, description, schema_json, execution_type, entrypoint, is_enabled, is_auto_generated
            FROM tools
            WHERE is_enabled = 1
            """
        ).fetchall()
        return [dict(r) for r in rows]

    def execute_registered_tool(self, name: str, args: Dict[str, Any], timeout_sec: int = 30) -> Dict[str, Any]:
        cursor = self.conn.cursor()
        row = cursor.execute(
            """
            SELECT id, name, execution_type, entrypoint
            FROM tools
            WHERE name = ? AND is_enabled = 1
            """,
            (name,)
        ).fetchone()

        if not row:
            raise ValueError(f"Outil actif introuvable : '{name}'")

        entrypoint = Path(row["entrypoint"])
        code = entrypoint.read_text(encoding="utf-8")
        ext = entrypoint.suffix.lower()
        runtime = "python" if ext == ".py" else ("node" if ext == ".js" else "bash")

        # Injection des arguments dans le script via stdin wrapper ou variable
        wrapper_code = f"""
import sys, json, io
sys.stdin = io.StringIO({json.dumps(json.dumps(args))})
{code}
""" if runtime == "python" else code

        return execute_in_sandbox(
            runtime=runtime,
            code=wrapper_code,
            timeout_sec=timeout_sec
        )
