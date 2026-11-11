pub mod fs;
pub mod search;
pub mod terminal;
pub mod web;
pub mod git;
pub mod diagnostics;

use serde_json::Value;

pub fn get_ide_tools_schemas() -> Vec<Value> {
    vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Lit le contenu d'un fichier source avec numéros de lignes précis. Permet de paginer avec start_line et end_line.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Chemin absolu ou relatif vers le fichier" },
                        "start_line": { "type": "integer", "description": "Ligne de début (base 1, optionnel)" },
                        "end_line": { "type": "integer", "description": "Ligne de fin (incluse, optionnel)" }
                    },
                    "required": ["path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Modifie chirurgicalement un fichier en remplaçant exactement un bloc de code par un nouveau bloc (target -> replacement).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Chemin du fichier à modifier" },
                        "target": { "type": "string", "description": "Le texte exact existant à remplacer (incluant espaces et indentations)" },
                        "replacement": { "type": "string", "description": "Le nouveau texte de remplacement" }
                    },
                    "required": ["path", "target", "replacement"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Crée un nouveau fichier source ou remplace intégralement un fichier existant.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Chemin du fichier à créer ou écraser" },
                        "content": { "type": "string", "description": "Contenu intégral du fichier" }
                    },
                    "required": ["path", "content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "grep_search",
                "description": "Effectue une recherche rapide par expression régulière à travers l'ensemble des fichiers du projet (respecte .gitignore).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Expression régulière ou texte recherché" },
                        "root_path": { "type": "string", "description": "Répertoire racine (défaut: répertoire courant)" },
                        "max_results": { "type": "integer", "description": "Nombre max de correspondances (défaut: 50)" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "Explore et liste les fichiers du projet sous forme arborescente (ignore automatiquement .git et dossiers générés).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "root_path": { "type": "string", "description": "Chemin racine" },
                        "max_depth": { "type": "integer", "description": "Profondeur maximale de recherche" }
                    },
                    "required": ["root_path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "terminal_exec",
                "description": "Exécute une commande terminal (cargo, git, python, npm, tests) sur la machine hôte.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "La commande shell à exécuter" },
                        "timeout_sec": { "type": "integer", "description": "Délai limite en secondes (défaut: 60)" }
                    },
                    "required": ["command"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Recherche sur le web des documentations d'API, bibliothèques ou résolutions de bugs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Mots-clés de recherche" },
                        "max_results": { "type": "integer", "description": "Nombre max de résultats" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "store_memory",
                "description": "Enregistre une information pérenne dans la mémoire du projet (décision d'architecture, règle, préférence, bug récurrent).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": { "type": "string", "description": "Clé unique mémorisable (ex: 'auth_architecture', 'db_convention')" },
                        "content": { "type": "string", "description": "Contenu détaillé à mémoriser" },
                        "scope": { "type": "string", "description": "'project' pour persister pour tout le projet, ou 'session' pour la session courante" }
                    },
                    "required": ["key", "content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "recall_memory",
                "description": "Rappelle une information enregistrée dans la mémoire du projet ou de la session.",
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
                "name": "invoke_subagent",
                "description": "Délègue une sous-tâche spécialisée à un agent autonome secondaire pour isoler le contexte (ex: recherche documentaire approfondie, exploration de code complexe ou validation de tests). Retourne le rapport de synthèse du sous-agent.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "role": { "type": "string", "description": "Rôle du sous-agent (ex: 'Code Explorer', 'Test Runner', 'API Researcher')" },
                        "task": { "type": "string", "description": "Instruction précise et objectif clair assigné au sous-agent" },
                        "readonly": { "type": "boolean", "description": "Si true (recommandé pour exploration), le sous-agent a accès uniquement aux outils de recherche/lecture" }
                    },
                    "required": ["role", "task"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kb_search",
                "description": "Recherche dans la base de connaissances d'expérience (BCPE) les pièges, règles et solutions connus pour un produit (ex: 'hernest', techno de niche, librairie spécifique) AVANT de coder ou modifier.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": { "type": "string", "description": "Identifiant du produit ou technologie (ex: 'hernest')" },
                        "query": { "type": "string", "description": "Mots-clés du problème rencontré, fonction ou symptôme" }
                    },
                    "required": ["product_id", "query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kb_propose",
                "description": "Enregistre une découverte, un bug résolu ou un piège évité dans la base de connaissances d'expérience (BCPE) pour qu'il ne se reproduise plus jamais (particulièrement crucial pour les technos de niche).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": { "type": "string", "description": "Identifiant du produit (ex: 'hernest')" },
                        "subject_key": { "type": "string", "description": "Clé slug unique du sujet (ex: 'monaco-webworker-blob', 'powershell-pipe-syntax')" },
                        "kind": { "type": "string", "description": "Type d'entrée: 'piege' (bug/comportement inattendu), 'regle' (bonne pratique/contrainte), 'catalogue' (description d'API)" },
                        "title": { "type": "string", "description": "Titre explicite du piège ou de la découverte" },
                        "symptom": { "type": "string", "description": "Message d'erreur exact ou symptôme constaté" },
                        "cause": { "type": "string", "description": "Cause racine technique identifiée" },
                        "correction": { "type": "string", "description": "Solution technique exacte appliquée pour corriger" },
                        "example": { "type": "string", "description": "Extrait de code minimal d'illustration (optionnel)" }
                    },
                    "required": ["product_id", "subject_key", "kind", "title", "correction"]
                }
            }
        })
    ]
}

pub fn get_governance_tools_schemas() -> Vec<Value> {
    vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "write_code",
                "description": "Applique un patch de code sur le projet. Le patch est immédiatement testé contre les sondes d'invariants dans un environnement isolé (shadow sandbox git worktree) avant d'être validé.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "target_contract_id": { "type": "string", "description": "Identifiant du contrat d'invariant satisfait (ex: 'contract_allocator', 'C1')" },
                        "target_file": { "type": "string", "description": "Fichier source cible" },
                        "patch": { "type": "string", "description": "Diff unifié ou contenu complet à écrire" }
                    },
                    "required": ["target_contract_id", "target_file", "patch"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "submit_invariants",
                "description": "Définit ou met à jour la proposition formelle d'invariants (spécification, contrats, sondes de test) dans .ide/invariants.json en Mode 3 Architecture.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "invariants": {
                            "type": "object",
                            "description": "Structure complète des invariants (schema_version, project_id, contracts avec probes, target_file, symbols, criticality)"
                        }
                    },
                    "required": ["invariants"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "request_architecture_review",
                "description": "Demande une validation humaine formelle de l'architecture et des invariants spécifiés (Mode 3). Interrompt la boucle d'exécution en attendant l'accord de l'utilisateur pour sceller le contrat cryptographique (SHA-256) et basculer en Mode 2 Contraint.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "summary": { "type": "string", "description": "Résumé exécutif clair de l'architecture proposée et des contrats" },
                        "invariants_hash": { "type": "string", "description": "Hash SHA-256 calculé du fichier invariants.json proposé" }
                    },
                    "required": ["summary"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "query_invariants",
                "description": "Consulte les invariants et signatures publiques d'un module spécifique du projet sans saturer la fenêtre de contexte.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "target_file_or_symbol": { "type": "string", "description": "Chemin de fichier ou symbole à inspecter" }
                    },
                    "required": ["target_file_or_symbol"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "request_contract_mutation",
                "description": "Sollicite une modification du contrat d'invariants scellé auprès de l'IDE et du développeur suite à une découverte technique ou un refactoring indispensable.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "target_contract_id": { "type": "string", "description": "Identifiant du contrat à muter" },
                        "initiator": { "type": "string", "enum": ["developer_request", "agent_bottleneck"], "description": "Initiateur de la demande" },
                        "reason": { "type": "string", "description": "Justification technique détaillée" },
                        "diff": { "type": "string", "description": "Diff unifié à appliquer sur invariants.json" },
                        "updated_probes": {
                            "type": "array",
                            "items": { "type": "object" },
                            "description": "Nouvelles sondes ou sondes modifiées (optionnel)"
                        }
                    },
                    "required": ["target_contract_id", "initiator", "reason", "diff"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "report_checkpoint_status",
                "description": "Exécuté obligatoirement après 3 échecs consécutifs sur une sonde. Fournit l'autopsie d'erreur et la stratégie avant d'obtenir l'autorisation de continuer.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "failed_probe_id": { "type": "string", "description": "Identifiant de la sonde en échec" },
                        "consecutive_failures": { "type": "integer", "description": "Nombre d'échecs consécutifs constatés" },
                        "root_cause_analysis": { "type": "string", "description": "Explication technique détaillée de la cause racine des 3 échecs passés" },
                        "next_attempt_strategy": { "type": "string", "description": "Ce qui sera fait différemment au 4e essai pour garantir la conformité" },
                        "request_type": { "type": "string", "enum": ["authorize_retry_4", "need_human_help", "suggest_contract_mutation"], "description": "Type de requête transmise à l'humain" }
                    },
                    "required": ["failed_probe_id", "root_cause_analysis", "next_attempt_strategy", "request_type"]
                }
            }
        })
    ]
}


