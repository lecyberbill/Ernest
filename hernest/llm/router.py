import json
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from hernest.llm.client import UnifiedLLMClient, LLMProviderError

class LLMFallbackRouter:
    """
    Routeur Multi-Inférence Tri-Backend avec cascade de Fallback automatique :
    1. Backend Primaire (ex: Ollama sur aurora-dev)
    2. Backend Secondaire (ex: LM Studio local sur 127.0.0.1:1234)
    3. Backend Tertiaire (ex: API Cloud OpenAI/Groq/OpenRouter)

    Si le backend primaire est hors-ligne ou échoue, bascule instantanément sur le suivant
    en conservant le même contrat et en traçant le basculement.
    """
    def __init__(self, backends: List[Dict[str, Any]], primary_index: int = 0):
        """
        Chaque backend est un dict :
        {
            "id": "ollama_aurora",
            "name": "Ollama (aurora-dev)",
            "provider": "ollama",
            "model": "qwen3.8:27b",
            "base_url": "http://192.168.1.165:11434",
            "api_key": None
        }
        """
        self.backends = backends
        self.primary_index = primary_index
        self.provider = backends[primary_index].get("provider", "router")
        self.model = backends[primary_index].get("model", "auto-fallback")
        self.clients = [
            UnifiedLLMClient(
                provider=b.get("provider", "ollama"),
                model=b.get("model", "qwen3.8:27b"),
                base_url=b.get("base_url"),
                api_key=b.get("api_key")
            )
            for b in backends
        ]

    def route_task_with_llm(self, prompt: str, has_attachment: bool = False, is_image: bool = False) -> Dict[str, Any]:
        """
        Fait appel à un micro-prompt LLM aiguilleur pour choisir dynamiquement
        le backend le plus qualifié pour la tâche.
        """
        if is_image:
            return {"backend": "ollama", "reason": "Présence d'une image : routage vers le modèle Vision"}

        router_prompt = (
            "Tu es le dispatcheur de calcul de l'assistant Hernest.\n"
            "Analyse l'instruction suivante et choisis le meilleur ouvrier informatique parmi ces 3 cibles :\n"
            "- 'ollama' : Gros calculs, code complexe, scripts système PowerShell/CMD, diagnostic technique lourd (GPU distant).\n"
            "- 'lmstudio' : Requêtes courtes, questions simples, discussions légères, synthèses directes (modèle local ultra-rapide).\n"
            "- 'cloud' : Rédaction très poussée, analyse conceptuelle avancée, traduction multilingue experte.\n\n"
            f"Instruction utilisateur : \"{prompt[:350]}\"\n\n"
            "Réponds UNIQUEMENT par un objet JSON valide sans aucun autre texte :\n"
            '{"backend": "ollama"|"lmstudio"|"cloud", "reason": "courte justification en 8 mots max"}'
        )

        messages = [
            {"role": "system", "content": "Tu es un routeur JSON ultra-concis. Réponds uniquement en JSON."},
            {"role": "user", "content": router_prompt}
        ]

        # Utilise le premier backend disponible pour décider rapidement
        for idx in [self.primary_index] + [i for i in range(len(self.clients)) if i != self.primary_index]:
            try:
                client = self.clients[idx]
                res = client.chat_completion(messages, tools=None)
                raw = res.get("content", "").strip()
                # Extraction JSON sécurisée
                import re
                match = re.search(r'\{.*\}', raw, re.DOTALL)
                if match:
                    parsed = json.loads(match.group(0))
                    target_b = parsed.get("backend", "ollama").lower()
                    if target_b in ("ollama", "lmstudio", "cloud"):
                        # Mettre à jour l'index primaire du routeur pour ce run
                        for b_idx, b_info in enumerate(self.backends):
                            if b_info["id"] == target_b:
                                self.primary_index = b_idx
                                self.provider = b_info.get("provider", "router")
                                self.model = b_info.get("model", "auto")
                                break
                        return {"backend": target_b, "reason": parsed.get("reason", "Décision du routeur")}
            except Exception:
                continue

        # Fallback par défaut si échec du routeur
        return {"backend": self.backends[self.primary_index]["id"], "reason": "Choix par défaut (routeur indisponible)"}

    def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        on_fallback: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Tente les backends dans l'ordre de priorité (primaire d'abord, puis les autres en secours).
        """
        errors = []
        ordered_indices = [self.primary_index] + [i for i in range(len(self.clients)) if i != self.primary_index]

        for idx in ordered_indices:
            client = self.clients[idx]
            backend_info = self.backends[idx]
            try:
                res = client.chat_completion(messages, tools)
                res["active_backend"] = backend_info["id"]
                res["active_model"] = client.model
                return res
            except Exception as e:
                err_msg = f"Backend '{backend_info['name']}' ({backend_info['id']}) indisponible: {e}"
                errors.append(err_msg)
                if on_fallback:
                    on_fallback(backend_info, str(e))

        raise LLMProviderError(f"Tous les backends d'inférence ont échoué : {'; '.join(errors)}")

    def probe_all_backends(self) -> List[Dict[str, Any]]:
        """Vérifie l'état en ligne/hors-ligne et inventorie les modèles disponibles de chaque backend."""
        statuses = []
        for b in self.backends:
            base_url = b.get("base_url", "").rstrip("/")
            provider = b.get("provider", "ollama")
            is_online = False
            latency_ms = None
            available_models = []

            try:
                import time
                t0 = time.time()
                if provider == "ollama":
                    url = f"{base_url}/api/tags"
                else:
                    url = f"{base_url}/v1/models"

                req = urllib.request.Request(url, headers={"User-Agent": "Hernest/1.0"})
                if b.get("api_key"):
                    req.add_header("Authorization", f"Bearer {b['api_key']}")

                with urllib.request.urlopen(req, timeout=1.8) as resp:
                    if resp.status == 200:
                        is_online = True
                        latency_ms = round((time.time() - t0) * 1000, 1)
                        data = json.loads(resp.read().decode("utf-8"))
                        if provider == "ollama":
                            # Ollama renvoie {"models": [{"name": "..."}, ...]}
                            available_models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                        else:
                            # OpenAI / LM Studio renvoie {"data": [{"id": "..."}, ...]}
                            available_models = [m.get("id") for m in data.get("data", []) if m.get("id")]
            except Exception:
                is_online = False

            statuses.append({
                "id": b["id"],
                "name": b["name"],
                "provider": provider,
                "model": b.get("model"),
                "is_online": is_online,
                "latency_ms": latency_ms,
                "available_models": available_models[:12] # Top 12 modèles pour rester synthétique
            })
        return statuses

