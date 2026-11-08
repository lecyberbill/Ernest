import json
import subprocess
import sys
from typing import Dict, Any, List, Optional
from pathlib import Path

class MCPClientError(Exception):
    pass

class MCPClient:
    """
    Client MCP (Model Context Protocol) via transport JSON-RPC 2.0 (stdio / subprocess).
    Permet à Hernest de charger et d'exécuter des outils exposés par des serveurs MCP tiers.
    """
    def __init__(self, server_name: str, command: str, args: Optional[List[str]] = None, cwd: Optional[str] = None):
        self.server_name = server_name
        self.command = command
        self.args = args or []
        self.cwd = cwd
        self.process: Optional[subprocess.Popen] = None
        self._msg_id = 0

    def start(self):
        cmd = [self.command] + self.args
        try:
            self.process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=self.cwd,
                bufsize=1
            )
        except Exception as e:
            raise MCPClientError(f"Impossible de démarrer le serveur MCP '{self.server_name}': {e}")

    def stop(self):
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception:
                self.process.kill()
            finally:
                self.process = None

    def _send_request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not self.process or self.process.poll() is not None:
            self.start()

        self._msg_id += 1
        req = {
            "jsonrpc": "2.0",
            "id": self._msg_id,
            "method": method,
            "params": params or {}
        }

        line = json.dumps(req) + "\n"
        self.process.stdin.write(line)
        self.process.stdin.flush()

        resp_line = self.process.stdout.readline()
        if not resp_line:
            raise MCPClientError(f"Le serveur MCP '{self.server_name}' a fermé la connexion de manière inattendue.")

        data = json.loads(resp_line)
        if "error" in data:
            raise MCPClientError(f"Erreur MCP ({data['error'].get('code')}): {data['error'].get('message')}")
        return data.get("result", {})

    def list_tools(self) -> List[Dict[str, Any]]:
        """Interroge tools/list et convertit les outils en format OpenAI Tools standard."""
        res = self._send_request("tools/list")
        tools = []
        for t in res.get("tools", []):
            tools.append({
                "name": f"mcp__{self.server_name}__{t['name']}",
                "description": f"[{self.server_name} MCP] {t.get('description', '')}",
                "parameters": t.get("inputSchema", {"type": "object", "properties": {}})
            })
        return tools

    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Appelle tools/call sur le serveur MCP."""
        # Retirer le préfixe mcp__server_name__
        prefix = f"mcp__{self.server_name}__"
        raw_name = tool_name[len(prefix):] if tool_name.startswith(prefix) else tool_name

        res = self._send_request("tools/call", {
            "name": raw_name,
            "arguments": arguments
        })
        return res

