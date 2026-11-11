pub mod terminal;
pub mod artifacts;
pub mod web;

use serde_json::Value;

pub fn get_primitive_tools_schemas() -> Vec<Value> {
    vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Recherche sur le web (DuckDuckGo) pour trouver des informations récentes, des cotations, des actualités ou des documentations en direct.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Mots-clés de recherche" },
                        "max_results": { "type": "integer", "description": "Nombre max de résultats (défaut: 5)" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "web_fetch",
                "description": "Télécharge et extrait le texte d'une page web via son URL HTTP/HTTPS.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "L'URL complète de la page web à lire" },
                        "max_chars": { "type": "integer", "description": "Nombre max de caractères textuels à conserver (défaut: 6000)" }
                    },
                    "required": ["url"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "terminal_exec",
                "description": "Exécute une commande terminal sécurisée (PowerShell / Bash) pour inspecter l'hôte ou manipuler des fichiers.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "La commande exacte à exécuter" },
                        "timeout_sec": { "type": "integer", "description": "Délai limite en secondes (défaut: 30)" }
                    },
                    "required": ["command"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "store_memory",
                "description": "Persiste une information clé dans la mémoire à long terme (scope 'project' ou 'session').",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": { "type": "string", "description": "Clé d'identification de la mémoire" },
                        "content": { "type": "string", "description": "Contenu textuel ou Markdown à mémoriser" },
                        "scope": { "type": "string", "enum": ["project", "session"], "description": "Portée de rétention" }
                    },
                    "required": ["key", "content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "recall_memory",
                "description": "Recherche et extrait une information précédemment mémorisée par sa clé.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": { "type": "string", "description": "Clé de la mémoire à retrouver" }
                    },
                    "required": ["key"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "create_artifact",
                "description": "Génère un livrable matérialisé (Markdown, Python, Rust, HTML, etc.) sauvegardé sur disque.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string", "description": "Titre du livrable" },
                        "content": { "type": "string", "description": "Contenu intégral du fichier" },
                        "artifact_type": { "type": "string", "description": "Type: markdown, rust, python, json, html" },
                        "file_path": { "type": "string", "description": "Chemin cible optionnel" }
                    },
                    "required": ["title", "content"]
                }
            }
        })
    ]
}

