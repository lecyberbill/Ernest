import json
import urllib.request
import urllib.error
from typing import Dict, Any, Optional

class WebFetchError(Exception):
    pass

def fetch_web_resource(
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    timeout_sec: int = 15,
    max_chars: int = 8000
) -> Dict[str, Any]:
    """
    Télécharge ou interroge une ressource web (HTTP/HTTPS).
    Limite le payload renvoyé à max_chars pour protéger le contexte du LLM.
    """
    if not (url.startswith("http://") or url.startswith("https://")):
        raise ValueError("Seules les URLs HTTP et HTTPS sont autorisées.")

    req_headers = {"User-Agent": "Hernest-Agent/1.0"}
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(url, headers=req_headers, method=method.upper())

    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw_data = resp.read()
            
            try:
                text_content = raw_data.decode("utf-8")
            except UnicodeDecodeError:
                text_content = raw_data.decode("latin-1", errors="replace")

            # Extraction propre du texte HTML : suppression des scripts, CSS et tags publicitaires
            if "html" in content_type.lower() or text_content.strip().startswith("<!DOCTYPE") or "<html" in text_content[:500].lower():
                try:
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(text_content, "html.parser")
                    # Supprimer les balises inutiles et polluantes
                    for tag in soup(["script", "style", "nav", "header", "footer", "iframe", "noscript", "svg"]):
                        tag.decompose()
                    cleaned_text = soup.get_text(separator="\n", strip=True)
                    text_content = cleaned_text
                except Exception:
                    pass # Fallback sur le texte brut si échec

            truncated = False
            if len(text_content) > max_chars:
                text_content = text_content[:max_chars] + f"\n... [Tronqué à {max_chars} caractères]"
                truncated = True

            return {
                "status_code": resp.status,
                "content_type": content_type,
                "truncated": truncated,
                "content": text_content
            }
    except urllib.error.HTTPError as exc:
        # Renvoyer le statut HTTP d'erreur comme résultat de l'outil plutôt que de crasher le runner ReAct
        # Cela permet à l'agent de voir la 404 et d'essayer une autre URL
        return {
            "status_code": exc.code,
            "error": f"Erreur HTTP {exc.code}: {exc.reason}",
            "content": f"La page demandée à '{url}' a renvoyé un code HTTP {exc.code} ({exc.reason}). Essaie une autre URL ou utilise un moteur de recherche."
        }
    except urllib.error.URLError as exc:
        return {
            "status_code": 0,
            "error": f"Erreur de résolution réseau: {exc.reason}",
            "content": f"Impossible de joindre '{url}': {exc.reason}."
        }
    except Exception as exc:
        return {
            "status_code": 0,
            "error": str(exc),
            "content": f"Erreur lors de la requête web: {str(exc)}"
        }

