import http.server
import socketserver
import json
from pathlib import Path
from typing import Optional, Any
from earnest.tools.attachment import extract_file_content
from earnest.tools.artifacts import create_artifact
from earnest.tools.registry import ToolRegistryService
from earnest.db.security import encrypt_secret, decrypt_secret
from earnest.db.connection import init_db
from earnest.db.memories import MemoryService
from earnest.llm.client import UnifiedLLMClient
from earnest.scheduler.os_scheduler import OSScheduler
from earnest.engine.react import ReActEngine

UI_DIR = Path(__file__).resolve().parent.parent.parent / "ui"

# Registre des signaux d'annulation par run_id
ACTIVE_RUN_ABORT_SIGNALS = {}

# Registre des approbations Human-In-The-Loop par run_id : {run_id: {"event": threading.Event(), "decision": None, "command": str}}
import threading
PENDING_APPROVALS = {}

def _get_configured_backends(conn) -> list:
    """Récupère la configuration dynamique de tous les backends déclarés et connectés depuis model_providers."""
    try:
        rows = conn.execute("SELECT * FROM model_providers ORDER BY priority ASC, created_at ASC").fetchall()
        if rows:
            backends = []
            for r in rows:
                if not r["is_enabled"]:
                    continue
                raw_k = r["api_key"]
                dec_k = decrypt_secret(raw_k) if raw_k else None
                backends.append({
                    "id": r["id"],
                    "name": r["name"],
                    "provider": r["provider_type"],
                    "model": r["model"],
                    "base_url": r["base_url"],
                    "api_key": dec_k,
                    "is_enabled": bool(r["is_enabled"])
                })
            if backends:
                return backends
    except Exception:
        pass

    # Fallback rétro-compatible sur app_settings si model_providers est vide
    rows = conn.execute("SELECT key, value, is_secret FROM app_settings").fetchall()
    settings = {}
    for r in rows:
        val = r["value"]
        if r["is_secret"] and val:
            val = decrypt_secret(val)
        settings[r["key"]] = val

    ollama_url = settings.get("ollama_base_url") or "http://192.168.1.165:11434"
    ollama_model = settings.get("default_model") or "qwen3.8:27b"
    lm_url = settings.get("lmstudio_url") or "http://127.0.0.1:1234"
    lm_model = settings.get("lmstudio_model") or "local-model"
    cloud_url = settings.get("cloud_url") or "https://api.deepseek.com"
    cloud_model = settings.get("cloud_model") or "deepseek-flash"
    api_key = settings.get("llm_api_key")

    cloud_name = "DeepSeek Cloud" if "deepseek" in cloud_url.lower() else "API Cloud"

    return [
        {"id": "ollama", "name": "Ollama (aurora-dev)", "provider": "ollama", "model": ollama_model, "base_url": ollama_url, "is_enabled": True},
        {"id": "lmstudio", "name": "LM Studio (Local)", "provider": "openai", "model": lm_model, "base_url": lm_url, "is_enabled": True},
        {"id": "cloud", "name": cloud_name, "provider": "openai", "model": cloud_model, "base_url": cloud_url, "api_key": api_key, "is_enabled": True}
    ]

def _url_unquote(s: str) -> str:
    """Décodage des séquences percent-encoding (%XX) standard sans dépendance externe."""
    res = bytearray()
    i = 0
    b = s.encode('utf-8')
    n = len(b)
    while i < n:
        if b[i:i+1] == b'%' and i + 2 < n:
            try:
                res.append(int(b[i+1:i+3], 16))
                i += 3
                continue
            except ValueError:
                pass
        res.append(b[i])
        i += 1
    return res.decode('utf-8', errors='replace')

def _parse_url_path_and_query(url: str):
    if "?" in url:
        path, raw_qs = url.split("?", 1)
        params = {}
        for part in raw_qs.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                params[_url_unquote(k)] = [_url_unquote(v)]
            elif part:
                params[_url_unquote(part)] = [""]
        return path, params
    return url, {}

class EarnestHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI_DIR), **kwargs)

    def do_GET(self):
        path, query = _parse_url_path_and_query(self.path)

        if path == "/api/settings":
            conn = init_db()
            rows = conn.execute("SELECT key, value, is_secret FROM app_settings").fetchall()
            settings = {r["key"]: ("***" if r["is_secret"] else r["value"]) for r in rows}
            conn.close()
            self._send_json(settings)

        elif path == "/api/model_providers":
            # Liste toutes les tuiles de modèles déclarés avec masque de sécurité sur api_key
            conn = init_db()
            try:
                rows = conn.execute("SELECT id, name, provider_type, base_url, model, (api_key IS NOT NULL AND api_key != '') as has_key, is_enabled, priority, updated_at FROM model_providers ORDER BY priority ASC, created_at ASC").fetchall()
                providers = [dict(r) for r in rows]
            except Exception:
                providers = []
            conn.close()
            self._send_json(providers)

        elif path == "/api/ollama/tags":
            conn = init_db()
            row = conn.execute("SELECT value FROM app_settings WHERE key = 'ollama_base_url'").fetchone()
            base_url = row["value"] if row else None
            conn.close()
            client = UnifiedLLMClient(provider="ollama", base_url=base_url)
            try:
                tags = client.list_ollama_tags()
                self._send_json({"models": tags})
            except Exception as e:
                self._send_json({"models": [], "error": str(e)})

        elif path == "/api/tools":
            conn = init_db()
            from earnest.tools.primitives import get_primitive_tools
            primitives = get_primitive_tools()
            service = ToolRegistryService(conn)
            customs = service.list_active_tools()
            
            formatted_tools = []
            for p in primitives:
                formatted_tools.append({
                    "id": f"primitive_{p['name']}",
                    "name": p["name"],
                    "description": p.get("description", ""),
                    "execution_type": "builtin",
                    "schema_json": json.dumps(p.get("parameters", {})),
                    "entrypoint": "earnest.tools",
                    "is_enabled": 1,
                    "is_auto_generated": 0
                })
            formatted_tools.extend(customs)
            conn.close()
            self._send_json(formatted_tools)

        elif path == "/api/mcp/servers":
            conn = init_db()
            row = conn.execute("SELECT value FROM app_settings WHERE key = 'mcp_servers_config'").fetchone()
            conn.close()
            servers = json.loads(row["value"]) if row and row["value"] else []
            self._send_json(servers)

        elif path == "/api/memories":
            conn = init_db()
            proj_id = query.get("project_id", ["default_workspace"])[0]
            search_q = query.get("q", [""])[0]
            service = MemoryService(conn)
            if search_q:
                mems = service.search_memories(proj_id, search_q)
            else:
                mems = service.list_memories(proj_id)
            conn.close()
            self._send_json(mems)

        elif path == "/api/chat/sessions":
            conn = init_db()
            proj_id = query.get("project_id", ["default_workspace"])[0]
            rows = conn.execute(
                "SELECT * FROM chat_sessions WHERE project_id = ? ORDER BY updated_at DESC", 
                (proj_id,)
            ).fetchall()
            sessions = [dict(r) for r in rows]
            conn.close()
            self._send_json(sessions)

        elif path == "/api/chat/messages":
            session_id = query.get("session_id", [""])[0]
            conn = init_db()
            rows = conn.execute(
                "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC", 
                (session_id,)
            ).fetchall()
            messages = [dict(r) for r in rows]
            conn.close()
            self._send_json(messages)

        elif path == "/api/artifacts":
            # Liste les artefacts générés pour le projet
            conn = init_db()
            from earnest.tools.artifacts import get_artifacts_dir
            proj_id = query.get("project_id", ["default_workspace"])[0]
            art_dir = get_artifacts_dir(proj_id)
            artifacts = []
            if art_dir.exists():
                for f in sorted(art_dir.glob("*.*"), key=lambda x: x.stat().st_mtime, reverse=True):
                    artifacts.append({
                        "name": f.name,
                        "path": str(f),
                        "size_kb": round(f.stat().st_size / 1024, 1),
                        "modified_at": f.stat().st_mtime
                    })
            conn.close()
            self._send_json(artifacts)

        elif path == "/api/artifacts/content":
            # Lecture directe et sécurisée du contenu d'un artefact
            file_path = query.get("path", [""])[0]
            if not file_path or not Path(file_path).exists():
                self._send_json({"error": "Fichier introuvable"}, status_code=404)
                return
            try:
                content = Path(file_path).read_text(encoding="utf-8", errors="replace")
                self._send_json({"content": content, "path": file_path, "name": Path(file_path).name})
            except Exception as e:
                self._send_json({"error": str(e)}, status_code=500)

        elif path == "/api/tasks":
            conn = init_db()
            proj_id = query.get("project_id", ["default_workspace"])[0]
            rows = conn.execute("SELECT * FROM scheduled_tasks WHERE project_id = ?", (proj_id,)).fetchall()
            tasks = [dict(r) for r in rows]
            conn.close()
            self._send_json(tasks)

        elif path == "/api/runs":
            conn = init_db()
            proj_id = query.get("project_id", ["default_workspace"])[0]
            rows = conn.execute("SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 30", (proj_id,)).fetchall()
            runs = [dict(r) for r in rows]
            conn.close()
            self._send_json(runs)

        elif path == "/api/run_details":
            run_id = query.get("run_id", [""])[0]
            conn = init_db()
            run_row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
            traces = conn.execute("SELECT * FROM run_traces WHERE run_id = ? ORDER BY step_order ASC", (run_id,)).fetchall()
            conn.close()
            self._send_json({
                "run": dict(run_row) if run_row else None,
                "traces": [dict(t) for t in traces]
            })

        elif path == "/api/backups":
            from earnest.maintenance.backup import BackupService
            svc = BackupService()
            self._send_json(svc.list_backups())

        elif path == "/api/evals/history":
            conn = init_db()
            from earnest.engine.evaluator import AgenticEvaluator
            evaluator = AgenticEvaluator(conn)
            history = evaluator.get_history(limit=50)
            conn.close()
            self._send_json(history)

        elif path == "/api/telemetry":
            conn = init_db()
            total_runs = conn.execute("SELECT COUNT(*) as c FROM runs").fetchone()["c"]
            success_runs = conn.execute("SELECT COUNT(*) as c FROM runs WHERE status = 'success'").fetchone()["c"]
            total_memories = conn.execute("SELECT COUNT(*) as c FROM memories").fetchone()["c"]
            total_tools = conn.execute("SELECT COUNT(*) as c FROM tools WHERE is_enabled = 1").fetchone()["c"]
            row_url = conn.execute("SELECT value FROM app_settings WHERE key = 'ollama_base_url'").fetchone()
            row_mod = conn.execute("SELECT value FROM app_settings WHERE key = 'default_model'").fetchone()

            # Sondage rapide des 3 backends pour le HUD
            from earnest.llm.router import LLMFallbackRouter
            backends_config = _get_configured_backends(conn)
            conn.close()
            router = LLMFallbackRouter(backends_config)
            backend_probes = router.probe_all_backends()

            self._send_json({
                "total_runs": total_runs,
                "success_runs": success_runs,
                "total_memories": total_memories,
                "active_tools": total_tools + 6, # + 6 primitives système
                "backends": backend_probes,
                "ollama_url": row_url["value"] if row_url else "http://192.168.1.165:11434",
                "current_model": row_mod["value"] if row_mod else "qwen3.8:27b",
                "gpu_target": "AMD Radeon AI PRO R9700 (aurora-svc)"
            })

        else:
            super().do_GET()

    def do_POST(self):
        path, _ = _parse_url_path_and_query(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        body = json.loads(post_data.decode("utf-8")) if post_data else {}

        if path == "/api/transcribe":
            # Transcription vocale Whisper locale (compatible Firefox/Chrome/Edge)
            audio_base64 = body.get("audio_base64", "")
            if not audio_base64:
                self._send_json({"error": "Aucune donnée audio reçue"}, status_code=400)
                return
            try:
                import base64
                if "," in audio_base64:
                    audio_base64 = audio_base64.split(",", 1)[1]
                audio_bytes = base64.b64decode(audio_base64)
                from earnest.tools.transcribe import transcribe_audio_bytes
                res = transcribe_audio_bytes(audio_bytes)
                self._send_json(res)
            except Exception as e:
                self._send_json({"error": f"Erreur transcription Whisper: {e}"}, status_code=500)

        elif path == "/api/model_providers":
            # Création ou modification d'une tuile de modèle
            import uuid
            p_id = body.get("id") or f"provider_{uuid.uuid4().hex[:8]}"
            name = body.get("name", "Nouveau Modèle")
            provider_type = body.get("provider_type", "openai")
            base_url = body.get("base_url", "http://127.0.0.1:1234").rstrip("/")
            model = body.get("model", "default")
            raw_key = body.get("api_key")
            is_enabled = 1 if body.get("is_enabled", True) else 0

            conn = init_db()
            with conn:
                existing = conn.execute("SELECT api_key FROM model_providers WHERE id = ?", (p_id,)).fetchone()
                # Chiffrement DPAPI de la clé API
                if raw_key and raw_key != "***":
                    enc_key = encrypt_secret(raw_key)
                else:
                    enc_key = existing["api_key"] if existing else None

                conn.execute("""
                    INSERT INTO model_providers (id, name, provider_type, base_url, model, api_key, is_enabled, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(id) DO UPDATE SET 
                        name=excluded.name,
                        provider_type=excluded.provider_type,
                        base_url=excluded.base_url,
                        model=excluded.model,
                        api_key=COALESCE(excluded.api_key, model_providers.api_key),
                        is_enabled=excluded.is_enabled,
                        updated_at=CURRENT_TIMESTAMP
                """, (p_id, name, provider_type, base_url, model, enc_key, is_enabled))
            conn.close()
            self._send_json({"status": "saved", "id": p_id})

        elif path == "/api/model_providers/toggle":
            # Connexion / Déconnexion d'une tuile
            p_id = body.get("id")
            conn = init_db()
            with conn:
                row = conn.execute("SELECT is_enabled FROM model_providers WHERE id = ?", (p_id,)).fetchone()
                if row:
                    new_val = 0 if row["is_enabled"] else 1
                    conn.execute("UPDATE model_providers SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_val, p_id))
                    conn.close()
                    self._send_json({"status": "updated", "id": p_id, "is_enabled": bool(new_val)})
                else:
                    conn.close()
                    self._send_json({"error": "Fournisseur non trouvé"}, status_code=404)

        elif path == "/api/model_providers/delete":
            p_id = body.get("id")
            conn = init_db()
            with conn:
                conn.execute("DELETE FROM model_providers WHERE id = ?", (p_id,))
            conn.close()
            self._send_json({"status": "deleted", "id": p_id})

        elif path == "/api/artifacts/delete":
            # Suppression d'un artefact du disque
            file_path = body.get("path", "")
            if not file_path or not Path(file_path).exists():
                self._send_json({"error": "Fichier introuvable"}, status_code=404)
                return
            try:
                p = Path(file_path)
                p.unlink()
                self._send_json({"status": "deleted", "path": file_path})
            except Exception as e:
                self._send_json({"error": str(e)}, status_code=500)

        elif path == "/api/artifacts/save":
            # Édition et sauvegarde d'un artefact existant
            file_path = body.get("path", "")
            content = body.get("content", "")
            if not file_path:
                self._send_json({"error": "Chemin non spécifié"}, status_code=400)
                return
            try:
                p = Path(file_path)
                p.write_text(content, encoding="utf-8")
                self._send_json({"status": "saved", "path": file_path, "size_kb": round(p.stat().st_size / 1024, 1)})
            except Exception as e:
                self._send_json({"error": str(e)}, status_code=500)

        elif path == "/api/settings":
            conn = init_db()
            with conn:
                for k, v in body.items():
                    is_secret = 1 if ("key" in k.lower() or "secret" in k.lower() or "token" in k.lower()) else 0
                    stored_val = encrypt_secret(str(v)) if is_secret and v else str(v)
                    conn.execute(
                        "INSERT INTO app_settings (key, value, is_secret, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) "
                        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                        (k, stored_val, is_secret)
                    )
            conn.close()
            self._send_json({"status": "ok"})

        elif path == "/api/mcp/servers":
            conn = init_db()
            servers = body.get("servers", [])
            with conn:
                conn.execute(
                    "INSERT INTO app_settings (key, value, is_secret, updated_at) VALUES ('mcp_servers_config', ?, 0, CURRENT_TIMESTAMP) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                    (json.dumps(servers, ensure_ascii=False),)
                )
            conn.close()
            self._send_json({"status": "ok", "count": len(servers)})

        elif path == "/api/mcp/test":
            server_name = body.get("name", "test")
            cmd = body.get("command", "")
            args = body.get("args", [])
            try:
                from earnest.mcp.client import MCPClient
                client = MCPClient(server_name=server_name, command=cmd, args=args)
                tools = client.list_tools()
                client.stop()
                self._send_json({"status": "ok", "tools": tools})
            except Exception as e:
                self._send_json({"status": "error", "error": str(e)}, status_code=500)

        elif path == "/api/tools/test":
            tool_name = body.get("name", "")
            args = body.get("args", {})
            conn = init_db()
            try:
                if tool_name.startswith("mcp__"):
                    from earnest.mcp.client import MCPClient
                    row = conn.execute("SELECT value FROM app_settings WHERE key = 'mcp_servers_config'").fetchone()
                    servers = json.loads(row["value"]) if row and row["value"] else []
                    parts = tool_name.split("__")
                    s_name = parts[1]
                    raw_fn = parts[2]
                    target_s = next((s for s in servers if s["name"] == s_name), None)
                    if not target_s:
                        raise ValueError(f"Serveur MCP '{s_name}' non configuré.")
                    client = MCPClient(server_name=s_name, command=target_s["command"], args=target_s.get("args", []))
                    res = client.call_tool(raw_fn, args)
                    client.stop()
                    self._send_json({"status": "ok", "result": res})
                else:
                    engine = ReActEngine(conn=conn, project_id=body.get("project_id", "default_workspace"), llm_client=None)
                    res = engine._dispatch_tool(tool_name, args, session_id="test_runner")
                    self._send_json({"status": "ok", "result": res})
            except Exception as e:
                self._send_json({"status": "error", "error": str(e)}, status_code=500)
            finally:
                conn.close()

        elif path == "/api/memories":
            conn = init_db()
            service = MemoryService(conn)
            res = service.store_memory(
                project_id=body.get("project_id", "default_workspace"),
                key=body["key"],
                content=body["content"],
                scope=body.get("scope", "project")
            )
            conn.close()
            self._send_json(res)

        elif path == "/api/tasks":
            conn = init_db()
            import uuid
            task_id = body.get("id") or f"task_{uuid.uuid4().hex[:8]}"
            with conn:
                conn.execute(
                    "INSERT INTO scheduled_tasks (id, name, prompt, cron_expr, project_id) VALUES (?, ?, ?, ?, ?)",
                    (task_id, body["name"], body["prompt"], body["cron_expr"], body.get("project_id", "default_workspace"))
                )
            # Synchronisation avec l'OS
            agent_cmd = f"python -m earnest.cli run --task-id {task_id}"
            OSScheduler.sync_task(task_id, body["cron_expr"], agent_cmd)
            conn.close()
            self._send_json({"status": "ok", "task_id": task_id})

        elif path == "/api/backups/create":
            project_id = body.get("project_id", "default_workspace")
            from earnest.maintenance.backup import BackupService
            svc = BackupService()
            res = svc.create_backup(project_id=project_id)
            self._send_json(res)

        elif path == "/api/evals/run":
            conn = init_db()
            from earnest.engine.evaluator import AgenticEvaluator
            from earnest.llm.router import LLMFallbackRouter
            backends_config = _get_configured_backends(conn)
            router = LLMFallbackRouter(backends_config, primary_index=0)
            evaluator = AgenticEvaluator(conn)
            summary = evaluator.run_benchmark(router=router)
            conn.close()
            self._send_json(summary)

        elif path == "/api/chat":
            conn = init_db()
            messages = body.get("messages", [])
            attachment = body.get("attachment")
            session_id = body.get("session_id")
            project_id = body.get("project_id", "default_workspace")

            # Créer la session SQLite si elle n'existe pas encore
            import uuid
            if not session_id:
                session_id = f"chat_{uuid.uuid4().hex[:8]}"
                first_msg_preview = messages[0]["content"][:40] if messages else "Nouvelle conversation"
                with conn:
                    conn.execute(
                        "INSERT INTO chat_sessions (id, title, project_id) VALUES (?, ?, ?)",
                        (session_id, first_msg_preview, project_id)
                    )

            if attachment and attachment.get("data") and messages:
                parsed_att = extract_file_content(attachment.get("name", "fichier"), attachment.get("data", ""))
                last_msg = messages[-1]
                if parsed_att.get("type") == "image":
                    last_msg["content"] += f"\n\n[IMAGE JOINTE: {parsed_att['file_name']}]"
                    # Vision native pour Ollama
                    last_msg["images"] = [parsed_att["base64_data"]]
                elif "text_content" in parsed_att:
                    last_msg["content"] += f"\n\n[CONTENU DU DOCUMENT JOINT '{parsed_att['file_name']}']:\n{parsed_att['text_content']}"

            # Persister le dernier message utilisateur dans SQLite
            if messages and messages[-1].get("role") == "user":
                with conn:
                    conn.execute(
                        "INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'user', ?)",
                        (session_id, messages[-1]["content"])
                    )

            from earnest.llm.router import LLMFallbackRouter
            backends_config = _get_configured_backends(conn)
            conn.close()

            router = LLMFallbackRouter(backends_config, primary_index=0)
            try:
                # Discussion directe sans forcer de tool calls
                res = router.chat_completion(messages=messages, tools=None)
                assistant_content = res.get("content", "")

                # Persister la réponse assistant dans SQLite
                conn_save = init_db()
                with conn_save:
                    conn_save.execute(
                        "INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'assistant', ?)",
                        (session_id, assistant_content)
                    )
                    conn_save.execute(
                        "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (session_id,)
                    )
                conn_save.close()

                self._send_json({
                    "content": assistant_content, 
                    "backend": res.get("active_backend"),
                    "session_id": session_id
                })
            except Exception as e:
                self._send_json({"error": str(e)}, status_code=500)

        elif path == "/api/run/abort":
            run_id = body.get("run_id")
            if run_id and run_id in ACTIVE_RUN_ABORT_SIGNALS:
                ACTIVE_RUN_ABORT_SIGNALS[run_id] = True
                # Débloquer également l'éventuelle attente d'approbation en cours
                if run_id in PENDING_APPROVALS:
                    PENDING_APPROVALS[run_id]["decision"] = False
                    PENDING_APPROVALS[run_id]["event"].set()
                self._send_json({"status": "abort_requested", "run_id": run_id})
            else:
                self._send_json({"status": "not_found_or_finished", "run_id": run_id})

        elif path == "/api/run/approve":
            run_id = body.get("run_id")
            approved = bool(body.get("approved", False))
            if run_id and run_id in PENDING_APPROVALS:
                PENDING_APPROVALS[run_id]["decision"] = approved
                PENDING_APPROVALS[run_id]["event"].set()
                self._send_json({"status": "approval_recorded", "run_id": run_id, "approved": approved})
            else:
                self._send_json({"status": "not_found", "run_id": run_id}, status_code=404)

        elif path == "/api/run/stream":
            # Endpoint Server-Sent Events (SSE) pour le streaming en temps réel des étapes ReAct
            import datetime
            import uuid
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            def send_sse(event_type: str, data_dict: dict):
                msg = f"event: {event_type}\ndata: {json.dumps(data_dict, ensure_ascii=False)}\n\n"
                try:
                    self.wfile.write(msg.encode("utf-8"))
                    self.wfile.flush()
                except Exception:
                    pass

            conn = init_db()
            prompt = body.get("prompt", "")
            project_id = body.get("project_id", "default_workspace")
            requested_backend = body.get("backend", "ollama")
            attachment = body.get("attachment")
            run_token = f"run_{uuid.uuid4().hex[:12]}"
            ACTIVE_RUN_ABORT_SIGNALS[run_token] = False

            attached_summary = ""
            attached_images = []
            if attachment and attachment.get("data"):
                parsed_att = extract_file_content(attachment.get("name", "fichier"), attachment.get("data", ""))
                if parsed_att.get("type") == "image":
                    attached_summary = f"\n\n[PIÈCE JOINTE IMAGE: {parsed_att['file_name']}]"
                    attached_images.append(parsed_att["base64_data"])
                elif "text_content" in parsed_att:
                    attached_summary = f"\n\n[CONTENU DU FICHIER JOINT '{parsed_att['file_name']}']:\n{parsed_att['text_content']}"
                prompt = prompt + attached_summary

            from earnest.llm.router import LLMFallbackRouter
            backends_config = _get_configured_backends(conn)

            primary_idx = 0
            is_multiagent = (requested_backend == "multiagent")
            if requested_backend == "lmstudio": primary_idx = 1; decision = {"backend": "lmstudio", "reason": "Sélection manuelle forcée"}
            elif requested_backend == "cloud": primary_idx = 2; decision = {"backend": "cloud", "reason": "Sélection manuelle forcée"}
            elif requested_backend == "ollama_forced": primary_idx = 0; decision = {"backend": "ollama", "reason": "Sélection manuelle forcée"}
            elif is_multiagent: primary_idx = 0; decision = {"backend": "multiagent", "reason": "Orchestration Hiérarchique Multi-Agents"}
            else:
                pre_router = LLMFallbackRouter(backends_config, primary_index=0)
                decision = pre_router.route_task_with_llm(prompt=prompt, has_attachment=bool(attachment), is_image=bool(attached_images))
                if decision["backend"] == "lmstudio": primary_idx = 1
                elif decision["backend"] == "cloud": primary_idx = 2
                else: primary_idx = 0

            send_sse("init", {"run_id": run_token, "backend": decision["backend"], "reason": decision["reason"]})

            # Émission immédiate de l'événement d'aiguillage
            send_sse("trace", {
                "step_order": 0,
                "step_type": "thought",
                "tool_name": None,
                "payload": f"🎯 [AIGUILLEUR LLM] Choix de l'ouvrier : **{decision['backend'].upper()}** — _{decision['reason']}_",
                "active_backend": decision["backend"],
                "timestamp": datetime.datetime.now().strftime("%H:%M:%S")
            })

            def on_stream_trace(trace_item):
                send_sse("trace", trace_item)

            def on_approval_needed(cmd: str, args: dict) -> bool:
                # Événement SSE de demande d'approbation envoyé au client Web
                approval_event = threading.Event()
                PENDING_APPROVALS[run_token] = {
                    "event": approval_event,
                    "decision": None,
                    "command": cmd
                }
                send_sse("approval_request", {
                    "run_id": run_token,
                    "command": cmd,
                    "tool": "terminal_exec"
                })
                # Attend jusqu'à 120 secondes le choix de l'utilisateur
                waited = approval_event.wait(timeout=120)
                decision_app = PENDING_APPROVALS.get(run_token, {}).get("decision", False) if waited else False
                PENDING_APPROVALS.pop(run_token, None)
                return bool(decision_app)

            router = LLMFallbackRouter(backends_config, primary_index=primary_idx)
            engine = ReActEngine(
                conn=conn,
                project_id=project_id,
                llm_client=router,
                trace_callback=on_stream_trace,
                should_abort=lambda: ACTIVE_RUN_ABORT_SIGNALS.get(run_token, False),
                approval_callback=on_approval_needed
            )

            try:
                if is_multiagent:
                    from earnest.engine.orchestrator import MultiAgentOrchestrator
                    orchestrator = MultiAgentOrchestrator(engine)
                    # 1. Étape Architecte
                    send_sse("trace", {
                        "step_order": 1,
                        "step_type": "thought",
                        "tool_name": None,
                        "payload": "📐 [ARCHITECTE] Analyse de la mission et décomposition du plan d'action...",
                        "active_backend": "multiagent",
                        "timestamp": datetime.datetime.now().strftime("%H:%M:%S")
                    })
                    plan = orchestrator.plan(prompt)
                    steps_md = "\n".join([f"**Étape {s.get('step_id', i+1)}** : {s.get('title', '')} — _{s.get('objective', '')}_" for i, s in enumerate(plan.get("steps", []))])
                    send_sse("trace", {
                        "step_order": 2,
                        "step_type": "thought",
                        "tool_name": None,
                        "payload": f"📋 [PLAN MULTI-AGENTS VALIDÉ] :\n{steps_md}",
                        "active_backend": "multiagent",
                        "timestamp": datetime.datetime.now().strftime("%H:%M:%S")
                    })

                    # 2. Étape Exécuteur (Worker)
                    worker_prompt = f"Mission globale : {prompt}\nPlan d'exécution à réaliser rigoureusement :\n{steps_md}\nExécute les actions requises et fournis le bilan complet."
                    res = engine.run(prompt=worker_prompt, images=attached_images if attached_images else None)

                    # 3. Étape Critique (Auditeur Reviewer)
                    send_sse("trace", {
                        "step_order": 99,
                        "step_type": "thought",
                        "tool_name": None,
                        "payload": "🔍 [AUDITEUR CRITIQUE] Examen de conformité et validation des livrables...",
                        "active_backend": "multiagent",
                        "timestamp": datetime.datetime.now().strftime("%H:%M:%S")
                    })
                    review = orchestrator.review(prompt, res.get("answer", ""))
                    verdict_icon = "✅" if review.get("is_complete") else "⚠️"
                    review_msg = f"{verdict_icon} **Verdict de l'Auditeur** (Confiance: {int(review.get('confidence_score', 1)*100)}%) :\n_{review.get('verdict', '')}_\n\nRecommandations : {review.get('recommendations', 'Aucune')}"
                    send_sse("trace", {
                        "step_order": 100,
                        "step_type": "thought",
                        "tool_name": None,
                        "payload": review_msg,
                        "active_backend": "multiagent",
                        "timestamp": datetime.datetime.now().strftime("%H:%M:%S")
                    })
                else:
                    res = engine.run(prompt=prompt, images=attached_images if attached_images else None)
                send_sse("completed", {
                    "run_id": run_token,
                    "status": "success",
                    "answer": res.get("answer"),
                    "usage": res.get("usage"),
                    "backend": decision["backend"]
                })
            except Exception as e:
                send_sse("error", {"error": str(e), "run_id": run_token})
            finally:
                ACTIVE_RUN_ABORT_SIGNALS.pop(run_token, None)
                conn.close()

        elif path == "/api/run":
            conn = init_db()
            prompt = body.get("prompt", "")
            project_id = body.get("project_id", "default_workspace")
            requested_backend = body.get("backend", "ollama")
            attachment = body.get("attachment") # {"name": "...", "data": "base64..."}
            traces_collected = []

            # Traitement de la pièce jointe (Multimodal / Document)
            attached_summary = ""
            attached_images = []
            if attachment and attachment.get("data"):
                parsed_att = extract_file_content(attachment.get("name", "fichier"), attachment.get("data", ""))
                if parsed_att.get("type") == "image":
                    attached_summary = f"\n\n[PIÈCE JOINTE IMAGE: {parsed_att['file_name']}]"
                    attached_images.append(parsed_att["base64_data"])
                elif "text_content" in parsed_att:
                    attached_summary = f"\n\n[CONTENU DU FICHIER JOINT '{parsed_att['file_name']}']:\n{parsed_att['text_content']}"
                prompt = prompt + attached_summary

            def on_trace(t):
                traces_collected.append(t)

            from earnest.llm.router import LLMFallbackRouter
            backends_config = _get_configured_backends(conn)

            primary_idx = 0
            if requested_backend == "lmstudio": 
                primary_idx = 1
                decision = {"backend": "lmstudio", "reason": "Sélection manuelle forcée"}
            elif requested_backend == "cloud": 
                primary_idx = 2
                decision = {"backend": "cloud", "reason": "Sélection manuelle forcée"}
            elif requested_backend == "ollama_forced":
                primary_idx = 0
                decision = {"backend": "ollama", "reason": "Sélection manuelle forcée"}
            else:
                # Routage dynamique par LLM Aiguilleur
                pre_router = LLMFallbackRouter(backends_config, primary_index=0)
                decision = pre_router.route_task_with_llm(
                    prompt=prompt,
                    has_attachment=bool(attachment),
                    is_image=bool(attached_images)
                )
                if decision["backend"] == "lmstudio": primary_idx = 1
                elif decision["backend"] == "cloud": primary_idx = 2
                else: primary_idx = 0

            # Trace immédiate de la décision de l'aiguilleur
            import datetime
            traces_collected.append({
                "step_order": 0,
                "step_type": "thought",
                "tool_name": None,
                "payload": f"🎯 [AIGUILLEUR LLM] Choix de l'ouvrier : **{decision['backend'].upper()}** — _{decision['reason']}_",
                "active_backend": decision["backend"],
                "timestamp": datetime.datetime.now().strftime("%H:%M:%S")
            })

            router = LLMFallbackRouter(backends_config, primary_index=primary_idx)
            engine = ReActEngine(conn=conn, project_id=project_id, llm_client=router, trace_callback=on_trace)
            try:
                res = engine.run(prompt=prompt, images=attached_images if attached_images else None)
                res["traces"] = traces_collected
                res["backend"] = decision["backend"]
                res["routing_reason"] = decision["reason"]
                self._send_json(res)
            except Exception as e:
                self._send_json({"error": str(e), "traces": traces_collected}, status_code=500)
            finally:
                conn.close()
        else:
            self.send_error(404, "Endpoint not found")

    def _send_json(self, data: Any, status_code: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def start_server(host: str = "127.0.0.1", port: int = 8080):
    server = ThreadingHTTPServer((host, port), EarnestHTTPRequestHandler)
    print(f"Earnest UI Cockpit accessible sur http://{host}:{port}")
    server.serve_forever()
