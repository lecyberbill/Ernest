import json
from typing import Dict, Any, List

STORE_MEMORY_SCHEMA: Dict[str, Any] = {
    "name": "store_memory",
    "description": "Enregistre une information textuelle ou une règle pour plus tard.",
    "parameters": {
        "type": "object",
        "properties": {
            "key": {"type": "string", "description": "Clé d'identification de la mémoire"},
            "content": {"type": "string", "description": "Contenu textuel/Markdown à stocker"},
            "scope": {
                "type": "string",
                "enum": ["session", "project"],
                "description": "'session' pour le travail en cours, 'project' pour une règle permanente"
            }
        },
        "required": ["key", "content", "scope"]
    }
}

RECALL_MEMORY_SCHEMA: Dict[str, Any] = {
    "name": "recall_memory",
    "description": "Récupère le contenu associé à une clé.",
    "parameters": {
        "type": "object",
        "properties": {
            "key": {"type": "string", "description": "Clé recherchée"}
        },
        "required": ["key"]
    }
}

SANDBOX_EXEC_SCHEMA: Dict[str, Any] = {
    "name": "sandbox_exec",
    "description": "Exécute un script éphémère (Python, Bash, JS) dans un environnement confiné pour résoudre une tâche inédite non couverte par les outils existants.",
    "parameters": {
        "type": "object",
        "properties": {
            "runtime": {"type": "string", "enum": ["python", "bash", "node"]},
            "code": {"type": "string", "description": "Code source complet à exécuter"},
            "timeout_sec": {"type": "integer", "default": 20}
        },
        "required": ["runtime", "code"]
    }
}

REGISTER_TOOL_SCHEMA: Dict[str, Any] = {
    "name": "register_tool",
    "description": "Enregistre durablement un script validé au registre des outils disponibles pour les futures sessions.",
    "parameters": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Nom unique du module (snake_case)"},
            "description": {"type": "string", "description": "Description fonctionnelle de l'outil pour le LLM"},
            "schema_json": {"type": "string", "description": "JSON Schema des arguments acceptés"},
            "code": {"type": "string", "description": "Code source de l'outil"},
            "runtime": {"type": "string", "enum": ["python", "bash", "node"]}
        },
        "required": ["name", "description", "schema_json", "code", "runtime"]
    }
}

TERMINAL_EXEC_SCHEMA: Dict[str, Any] = {
    "name": "terminal_exec",
    "description": "Exécute une commande système sur la machine locale dans le workspace du projet (ex: git, dir, rocm-smi, nvidia-smi, cargo, pip). Protégé contre les commandes destructives.",
    "parameters": {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "Commande shell à exécuter"},
            "timeout_sec": {"type": "integer", "default": 30}
        },
        "required": ["command"]
    }
}

WEB_FETCH_SCHEMA: Dict[str, Any] = {
    "name": "web_fetch",
    "description": "Télécharge le contenu textuel d'une URL web (HTTP/HTTPS) pour consulter une documentation, une API ou une ressource en ligne.",
    "parameters": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL complète à interroger (http:// ou https://)"},
            "timeout_sec": {"type": "integer", "default": 15}
        },
        "required": ["url"]
    }
}

WEB_SEARCH_SCHEMA: Dict[str, Any] = {
    "name": "web_search",
    "description": "Recherche sur le web des pages, recettes, documentations ou solutions à un problème via un moteur de recherche.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Termes de recherche (ex: recette couscous traditionnel, documentation rust tokio)"},
            "max_results": {"type": "integer", "default": 5}
        },
        "required": ["query"]
    }
}

ARTIFACT_CREATE_SCHEMA: Dict[str, Any] = {
    "name": "create_artifact",
    "description": "Génère et matérialise un artefact structuré sur le disque (document Markdown, page HTML, diagramme SVG, script complet, rapport ou export JSON/CSV).",
    "parameters": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Titre explicite de l'artefact (ex: Recette Couscous Traditionnel, Rapport VRAM)"},
            "content": {"type": "string", "description": "Contenu intégral de l'artefact"},
            "artifact_type": {
                "type": "string",
                "enum": ["markdown", "html", "svg", "json", "python", "shell", "text"],
                "default": "markdown",
                "description": "Format de l'artefact"
            },
            "file_path": {
                "type": "string",
                "description": "Chemin de destination facultatif (ex: .\\recette.md). Si omis, il est placé dans le magasin d'artefacts local."
            }
        },
        "required": ["title", "content"]
    }
}

def get_primitive_tools() -> List[Dict[str, Any]]:
    """Retourne la liste des outils fondamentaux (JSON Schema standard)."""
    return [
        STORE_MEMORY_SCHEMA,
        RECALL_MEMORY_SCHEMA,
        SANDBOX_EXEC_SCHEMA,
        REGISTER_TOOL_SCHEMA,
        TERMINAL_EXEC_SCHEMA,
        WEB_FETCH_SCHEMA,
        WEB_SEARCH_SCHEMA,
        ARTIFACT_CREATE_SCHEMA
    ]
