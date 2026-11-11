import json
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional

class LLMProviderError(Exception):
    pass

class UnifiedLLMClient:
    """
    Interface unifiée compatible Ollama local et APIs OpenAI-compatibles.
    """
    def __init__(
        self,
        provider: str = "ollama",
        model: str = "llama3:latest",
        base_url: Optional[str] = None,
        api_key: Optional[str] = None
    ):
        self.provider = provider
        self.model = model
        self.base_url = (base_url or ("http://localhost:11434" if provider == "ollama" else "https://api.openai.com")).rstrip("/")
        self.api_key = api_key

    def list_ollama_tags(self) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/api/tags"
        req = urllib.request.Request(url, headers={"User-Agent": "Earnest/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode("utf-8"))
                return data.get("models", [])
        except Exception as e:
            raise LLMProviderError(f"Impossible de joindre Ollama à {url} : {e}")

    def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Effectue un appel de chat completion unifié avec support des tool calls.
        Format de retour :
        {
            "content": str ou None,
            "tool_calls": [
                {"id": str, "name": str, "arguments": dict}
            ]
        }
        """
        if self.provider == "ollama":
            return self._call_ollama(messages, tools)
        else:
            return self._call_openai_compatible(messages, tools)

    def _call_ollama(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/api/chat"
        # Nettoyage et adaptation du format messages pour Ollama
        ollama_msgs = []
        for m in messages:
            cleaned_m = {"role": m.get("role", "user"), "content": m.get("content", "")}
            if "images" in m:
                cleaned_m["images"] = m["images"]
            if "tool_calls" in m:
                # Ollama attend arguments sous forme d'objet dict et sans syntaxe stringifiée
                cleaned_tc = []
                for tc in m["tool_calls"]:
                    fn = tc.get("function", {})
                    raw_args = fn.get("arguments", {})
                    if isinstance(raw_args, str):
                        try:
                            raw_args = json.loads(raw_args)
                        except Exception:
                            raw_args = {}
                    cleaned_tc.append({
                        "function": {
                            "name": fn.get("name"),
                            "arguments": raw_args
                        }
                    })
                cleaned_m["tool_calls"] = cleaned_tc
            ollama_msgs.append(cleaned_m)

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": ollama_msgs,
            "stream": False
        }
        if tools:
            # Conversion au format Ollama / standard OpenAI tool format
            ollama_tools = []
            for t in tools:
                if "type" in t and t["type"] == "function":
                    ollama_tools.append(t)
                else:
                    ollama_tools.append({
                        "type": "function",
                        "function": {
                            "name": t["name"],
                            "description": t.get("description", ""),
                            "parameters": t.get("parameters", {})
                        }
                    })
            payload["tools"] = ollama_tools

        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                msg = res_json.get("message", {})
                content = msg.get("content")
                tool_calls = []
                for tc in msg.get("tool_calls", []):
                    fn = tc.get("function", {})
                    fn_name = fn.get("name")
                    fn_args = fn.get("arguments", {})
                    if isinstance(fn_args, str):
                        try:
                            fn_args = json.loads(fn_args)
                        except Exception:
                            pass
                    tool_calls.append({
                        "id": tc.get("id", f"call_{fn_name}"),
                        "name": fn_name,
                        "arguments": fn_args
                    })
                # Remontée des tokens consommés (Ollama)
                prompt_tokens = res_json.get("prompt_eval_count", 0)
                completion_tokens = res_json.get("eval_count", 0)
                total_tokens = prompt_tokens + completion_tokens

                return {
                    "content": content,
                    "tool_calls": tool_calls,
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens
                    }
                }
        except Exception as e:
            raise LLMProviderError(f"Échec de l'appel LLM Ollama: {e}")

    def _call_openai_compatible(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/v1/chat/completions"
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False
        }
        if tools:
            openai_tools = []
            for t in tools:
                if "type" in t and t["type"] == "function":
                    openai_tools.append(t)
                else:
                    openai_tools.append({
                        "type": "function",
                        "function": {
                            "name": t["name"],
                            "description": t.get("description", ""),
                            "parameters": t.get("parameters", {})
                        }
                    })
            payload["tools"] = openai_tools

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key or ''}"
        }
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                choice = res_json.get("choices", [{}])[0]
                msg = choice.get("message", {})
                content = msg.get("content")
                reasoning_content = msg.get("reasoning_content")
                tool_calls = []
                for tc in msg.get("tool_calls", []):
                    fn = tc.get("function", {})
                    fn_name = fn.get("name")
                    fn_args = fn.get("arguments", {})
                    if isinstance(fn_args, str):
                        try:
                            fn_args = json.loads(fn_args)
                        except Exception:
                            pass
                    tool_calls.append({
                        "id": tc.get("id", f"call_{fn_name}"),
                        "name": fn_name,
                        "arguments": fn_args
                    })
                # Remontée des tokens consommés (OpenAI / LM Studio)
                usage = res_json.get("usage", {})
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)
                total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

                res = {
                    "content": content,
                    "tool_calls": tool_calls,
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens
                    }
                }
                if reasoning_content is not None:
                    res["reasoning_content"] = reasoning_content
                return res
        except urllib.error.HTTPError as he:
            body_err = ""
            try:
                body_err = he.read().decode("utf-8")
            except Exception:
                pass
            raise LLMProviderError(f"Échec de l'appel LLM OpenAI-compatible (HTTP {he.code}): {he.reason} - {body_err}") from he
        except Exception as e:
            raise LLMProviderError(f"Échec de l'appel LLM OpenAI-compatible: {e}") from e

