import json
import uuid
import hashlib
import sqlite3
from typing import Dict, Any, List, Optional, Callable
from earnest.tools.primitives import get_primitive_tools
from earnest.db.memories import MemoryService
from earnest.tools.sandbox import execute_in_sandbox
from earnest.tools.terminal import execute_terminal
from earnest.tools.web import fetch_web_resource
from earnest.tools.search import search_duckduckgo
from earnest.tools.artifacts import create_artifact
from earnest.tools.registry import ToolRegistryService
from earnest.llm.client import UnifiedLLMClient, LLMProviderError

class ReActExecutionError(Exception):
    pass

class ReActEngine:
    """
    Moteur d'exécution éphémère ReAct (run-to-completion).
    Exécute la boucle de résolution, persiste les traces et termine proprement.
    """
    def __init__(
        self,
        conn: sqlite3.Connection,
        project_id: str,
        llm_client: UnifiedLLMClient,
        max_steps: int = 10,
        trace_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        should_abort: Optional[Callable[[], bool]] = None,
        approval_callback: Optional[Callable[[str, Dict[str, Any]], bool]] = None
    ):
        self.conn = conn
        self.project_id = project_id
        self.llm_client = llm_client
        self.max_steps = max_steps
        self.trace_callback = trace_callback
        self.should_abort = should_abort or (lambda: False)
        self.approval_callback = approval_callback

        self.memory_service = MemoryService(conn)
        self.tool_registry = ToolRegistryService(conn)

    def _record_trace(self, run_id: str, step_order: int, step_type: str, tool_name: Optional[str], payload: Any, active_backend: Optional[str] = None):
        import datetime
        timestamp_str = datetime.datetime.now().strftime("%H:%M:%S")
        payload_str = json.dumps(payload, ensure_ascii=False) if not isinstance(payload, str) else payload
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO run_traces (run_id, step_order, step_type, tool_name, payload)
                VALUES (?, ?, ?, ?, ?)
                """,
                (run_id, step_order, step_type, tool_name, payload_str)
            )
        if self.trace_callback:
            self.trace_callback({
                "run_id": run_id,
                "step_order": step_order,
                "step_type": step_type,
                "tool_name": tool_name,
                "payload": payload_str,
                "active_backend": active_backend,
                "timestamp": timestamp_str
            })

    def run(self, prompt: str, task_id: Optional[str] = None, images: Optional[List[str]] = None) -> Dict[str, Any]:
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO runs (id, project_id, task_id, prompt, status, provider, model)
                VALUES (?, ?, ?, ?, 'running', ?, ?)
                """,
                (run_id, self.project_id, task_id, prompt, self.llm_client.provider, self.llm_client.model)
            )

        # 1. Charger les mémoires du projet et les settings configurés
        project_memories = self.memory_service.list_memories(self.project_id)
        memories_summary = "\n".join([f"- {m['key']} ({m['scope']}): {m['content']}" for m in project_memories])

        # Lecture des chemins et ressources personnalisées depuis app_settings
        cursor = self.conn.cursor()
        settings_rows = cursor.execute("SELECT key, value FROM app_settings WHERE is_secret = 0").fetchall()
        config_summary = "\n".join([f"- {r['key']}: {r['value']}" for r in settings_rows])

        import platform, sys
        os_info = f"{platform.system()} {platform.release()} ({platform.architecture()[0]}), Python {sys.version.split()[0]}"

        system_prompt = (
            "Tu es un assistant agentique autonome, modulaire et déterministe opérant en mode ReAct sur la machine locale.\n"
            f"ENVIRONNEMENT SYSTÈME HÔTE: {os_info}\n"
            f"RÉPERTOIRE PROJET COURANT (CWD): {self.project_id}\n"
            f"SESSION ID DU RUN: {run_id}\n\n"
            "RESSOURCES & CHEMINS CONFIGURÉS (app_settings):\n"
            f"{config_summary if config_summary else 'Aucun chemin spécifique configuré.'}\n\n"
            "MÉMOIRES CONNUES DU PROJET:\n"
            f"{memories_summary if memories_summary else 'Aucune mémoire préalable.'}\n\n"
            "RÈGLES D'EXÉCUTION:\n"
            "- Adapte directement tes scripts à l'OS hôte détecté (PowerShell/CMD sur Windows).\n"
            "- SOIS EFFICACE ET ÉCONOME : quand tu as obtenu l'information demandée par un outil (ex: taille RAM ou VRAM), NE MULTIPLIE PAS LES ESSAIS INUTILES, formule directement ta réponse finale et arrête-toi.\n"
            "- Utilise en priorité les chemins et ressources configurés ci-dessus.\n"
            "- Utilise tes outils (terminal_exec, sandbox_exec, web_search, web_fetch, store_memory, recall_memory, register_tool, create_artifact).\n"
            "Quand la tâche est terminée, formule une réponse finale claire."
        )

        user_msg: Dict[str, Any] = {"role": "user", "content": prompt}
        if images:
            user_msg["images"] = images

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            user_msg
        ]

        # 2. Assembler les outils disponibles (primitives + custom + MCP)
        tools = list(get_primitive_tools())
        active_custom_tools = self.tool_registry.list_active_tools()
        for ct in active_custom_tools:
            try:
                schema = json.loads(ct["schema_json"])
                tools.append({
                    "name": ct["name"],
                    "description": ct["description"],
                    "parameters": schema
                })
            except Exception:
                pass

        # Découverte des serveurs MCP configurés
        mcp_clients_map = {}
        try:
            mcp_row = self.conn.execute("SELECT value FROM app_settings WHERE key = 'mcp_servers_config'").fetchone()
            if mcp_row and mcp_row["value"]:
                from earnest.mcp.client import MCPClient
                servers_conf = json.loads(mcp_row["value"])
                for s in servers_conf:
                    s_name = s.get("name")
                    s_cmd = s.get("command")
                    s_args = s.get("args", [])
                    if s_name and s_cmd:
                        try:
                            client = MCPClient(server_name=s_name, command=s_cmd, args=s_args)
                            s_tools = client.list_tools()
                            for st in s_tools:
                                tools.append(st)
                                mcp_clients_map[st["name"]] = client
                        except Exception:
                            pass
        except Exception:
            pass

        step_order = 1
        final_answer = None
        total_prompt_tokens = 0
        total_completion_tokens = 0
        import time
        start_time = time.time()
        
        # Initialisation du Tracer OpenTelemetry
        from earnest.engine.telemetry import AgentTracer
        tracer = AgentTracer(run_id=run_id, project_id=self.project_id)

        try:
            for iteration in range(self.max_steps):
                if self.should_abort():
                    raise ReActExecutionError("Exécution interrompue à la demande de l'utilisateur (Abort Signal).")

                # Appel LLM
                response = self.llm_client.chat_completion(messages, tools)
                content = response.get("content")
                tool_calls = response.get("tool_calls", [])
                active_backend = response.get("active_backend", "ollama")

                # Agrégation des tokens
                usage = response.get("usage", {})
                total_prompt_tokens += usage.get("prompt_tokens", 0)
                total_completion_tokens += usage.get("completion_tokens", 0)

                if content:
                    self._record_trace(run_id, step_order, "thought", None, content, active_backend=active_backend)
                    step_order += 1

                # Préparation du message assistant pour l'historique conversationnel
                # Conformité stricte OpenAI / DeepSeek : si tool_calls existe, il DOIT être attaché au message assistant
                if content or tool_calls:
                    msg_obj = {
                        "role": "assistant",
                        "content": content or ""
                    }
                    if tool_calls:
                        msg_obj["tool_calls"] = [
                            {
                                "id": tc.get("id", f"call_{tc['name']}"),
                                "type": "function",
                                "function": {
                                    "name": tc["name"],
                                    "arguments": json.dumps(tc["arguments"]) if isinstance(tc["arguments"], dict) else str(tc["arguments"])
                                }
                            }
                            for tc in tool_calls
                        ]
                    if "reasoning_content" in response:
                        msg_obj["reasoning_content"] = response["reasoning_content"]
                    messages.append(msg_obj)

                if not tool_calls:
                    final_answer = content or "Tâche terminée sans sortie additionnelle."
                    self._record_trace(run_id, step_order, "answer", None, final_answer, active_backend=active_backend)
                    step_order += 1
                    break

                # Exécution des appels d'outils
                for call in tool_calls:
                    if self.should_abort():
                        raise ReActExecutionError("Exécution interrompue à la demande de l'utilisateur (Abort Signal).")

                    fn_name = call["name"]
                    fn_args = call.get("arguments", {})
                    self._record_trace(run_id, step_order, "tool_call", fn_name, fn_args, active_backend=active_backend)
                    step_order += 1

                    tool_t0 = time.time()
                    output_str = self._dispatch_tool(fn_name, fn_args, run_id, mcp_clients_map)
                    tool_dur = round((time.time() - tool_t0) * 1000, 2)
                    tracer.record_tool_call(fn_name, fn_args, tool_dur, success=not ("error" in output_str.lower()))
                    self._record_trace(run_id, step_order, "tool_output", fn_name, output_str, active_backend=active_backend)
                    step_order += 1

                    messages.append({
                        "role": "tool",
                        "tool_call_id": call.get("id"),
                        "name": fn_name,
                        "content": output_str
                    })
            else:
                raise ReActExecutionError(f"Nombre maximum d'étapes ({self.max_steps}) dépassé sans résolution finale.")

            duration_ms = round((time.time() - start_time) * 1000)
            total_tokens = total_prompt_tokens + total_completion_tokens
            tracer.finish(status="OK")

            with self.conn:
                self.conn.execute(
                    """
                    UPDATE runs 
                    SET status = 'success', completed_at = CURRENT_TIMESTAMP,
                        prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, duration_ms = ?
                    WHERE id = ?
                    """,
                    (total_prompt_tokens, total_completion_tokens, total_tokens, duration_ms, run_id)
                )

            return {
                "run_id": run_id,
                "status": "success",
                "answer": final_answer,
                "usage": {
                    "prompt_tokens": total_prompt_tokens,
                    "completion_tokens": total_completion_tokens,
                    "total_tokens": total_tokens,
                    "duration_ms": duration_ms
                }
            }

        except Exception as exc:
            self._record_trace(run_id, step_order, "error", None, str(exc))
            with self.conn:
                self.conn.execute(
                    """
                    UPDATE runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (run_id,)
                )
            raise ReActExecutionError(f"Échec de l'exécution du run {run_id}: {exc}") from exc

    def _dispatch_tool(self, name: str, args: Dict[str, Any], session_id: str, mcp_clients_map: Optional[Dict[str, Any]] = None) -> str:
        """Route l'exécution de l'outil vers le composant approprié."""
        if mcp_clients_map and name in mcp_clients_map:
            client = mcp_clients_map[name]
            res = client.call_tool(name, args)
            return json.dumps(res, ensure_ascii=False)

        if name == "store_memory":
            res = self.memory_service.store_memory(
                project_id=self.project_id,
                key=args["key"],
                content=args["content"],
                scope=args.get("scope", "session"),
                session_id=session_id
            )
            return json.dumps(res, ensure_ascii=False)

        elif name == "recall_memory":
            val = self.memory_service.recall_memory(
                project_id=self.project_id,
                key=args["key"],
                session_id=session_id
            )
            return json.dumps({"key": args["key"], "found": val is not None, "content": val}, ensure_ascii=False)

        elif name == "sandbox_exec":
            res = execute_in_sandbox(
                runtime=args["runtime"],
                code=args["code"],
                timeout_sec=args.get("timeout_sec", 20)
            )
            return json.dumps(res, ensure_ascii=False)

        elif name == "terminal_exec":
            cmd = args.get("command", "")
            from earnest.tools.terminal import is_sensitive_command
            # Validation Human-In-The-Loop si commande sensible
            if is_sensitive_command(cmd) and self.approval_callback:
                approved = self.approval_callback(cmd, args)
                if not approved:
                    return json.dumps({
                        "status": "refused_by_user",
                        "error": f"L'utilisateur a explicitement REFUSÉ l'exécution de la commande sensible : '{cmd}'.",
                        "suggestion": "Ne réessaye pas la même commande. Propose une alternative en lecture seule ou formule ta conclusion."
                    }, ensure_ascii=False)

            try:
                res = execute_terminal(
                    command=cmd,
                    timeout_sec=args.get("timeout_sec", 30)
                )
            except Exception as e:
                # Retourner l'erreur de sécurité ou d'exécution sous forme de tool_output
                # pour que le modèle puisse s'adapter au lieu de faire crasher le run
                res = {"status": "error", "error": str(e), "suggestion": "Cette commande est bloquée par les garde-fous de sécurité. Utilise un script sandbox_exec ou cible un chemin spécifique sans suppression récursive globale."}
            return json.dumps(res, ensure_ascii=False)

        elif name == "web_fetch":
            res = fetch_web_resource(
                url=args["url"],
                timeout_sec=args.get("timeout_sec", 15)
            )
            return json.dumps(res, ensure_ascii=False)

        elif name == "web_search":
            res = search_duckduckgo(
                query=args["query"],
                max_results=args.get("max_results", 5)
            )
            return json.dumps(res, ensure_ascii=False)

        elif name == "create_artifact":
            res = create_artifact(
                project_id=self.project_id,
                title=args["title"],
                content=args["content"],
                artifact_type=args.get("artifact_type", "markdown"),
                file_path=args.get("file_path")
            )
            return json.dumps(res, ensure_ascii=False)

        elif name == "register_tool":
            res = self.tool_registry.register_tool(
                name=args["name"],
                description=args["description"],
                schema_json=args["schema_json"],
                code=args["code"],
                runtime=args["runtime"]
            )
            return json.dumps(res, ensure_ascii=False)

        else:
            # Recherche dans le registre d'outils custom
            res = self.tool_registry.execute_registered_tool(name, args)
            return json.dumps(res, ensure_ascii=False)

