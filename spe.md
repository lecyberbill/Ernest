Spécifications Techniques : Assistant Agentique Modulaire Local-First (Sans Démon)

Document de conception et d'architecture pour le développement d'un assistant agentique personnel inspiré des concepts de Hermes Agent, opérant en mode exécution éphémère (run-to-completion), avec persistance SQLite, délégation de planification à l'OS et interface utilisateur en Vanilla JS/CSS (Web Components).
1. Vision & Principes Fondamentaux

    Zéro Démon Applicatif Permanent : Aucun processus résident en mémoire en continu. L'assistant démarre à la demande, exécute sa boucle de travail, persiste son état et ses traces dans SQLite, puis se termine proprement (exit 0).

    Ordonnancement Délégué à l'OS : Les tâches récurrentes ou différées ne dépendent pas d'un scheduler applicatif interne instable, mais des mécanismes natifs du système d'exploitation (cron / systemd.timer sous Linux/macOS, schtasks sous Windows).

    UI Cockpit en Vanilla Web Standards : Une interface utilisateur locale sans framework lourd (zéro build step, zéro node_modules géant), construite en HTML5, CSS moderne natif et Web Components (Custom Elements).

    Agnosticisme du Stockage : L'agent ignore l'existence de la base SQLite et de son schéma relationnel. Il interagit avec la persistance uniquement via des primitives abstraites (store_memory, recall_memory).

    Triple Niveau de Résolution :

        Niveau 1 (Routine) : Utilisation directe d'un outil enregistré au registre.

        Niveau 2 (Composition) : Enchaînement déterministe d'outils connus.

        Niveau 3 (Synthèse & Auto-création) : Écriture et exécution d'un script éphémère dans une sandbox pour gérer l'imprévu, avec possibilité de l'enregistrer comme nouvel outil pérenne.

    Multi-Backend LLM Standardisé : Bascule transparente entre une instance Ollama locale et des API distantes via une interface unifiée compatible OpenAI.

2. Architecture Globale du Système
Plaintext

┌─────────────────────────────────────────────────────────────┐
│             INTERFACE UTILISATEUR (Vanilla Web)             │
│   • Console de run & streaming en direct                    │
│   • Menu de configuration LLM (Ollama auto-tag / Clés API)  │
│   • Inspecteur & éditeur de mémoires SQLite                 │
│   • Gestionnaire de tâches planifiées (Générateur Cron)     │
└──────────────┬───────────────────────────────┬──────────────┘
               │ Lecture / Écriture Directe    │ Déclencheur manuel
               ▼                               ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│      PERSISTANCE SQLITE      │ │      RUNNER ÉPHÉMÈRE       │
│  • Configuration système     │ │ • CLI / Mode Batch         │
│  • Mémoires (session/projet) │◄┤ • Assemblage de contexte   │
│  • Registre des outils       │ │ • Boucle ReAct (Tools)     │
│  • Tâches planifiées         │ │ • Exécution sandbox        │
│  • Traces & audits des runs  │ │ • Sortie déterministe (0)  │
└──────────────▲───────────────┘ └─────────────▲──────────────┘
               │                               │
               └───────────┬───────────────────┘
                           │ Déclenchement automatique
               ┌───────────┴───────────────────┐
               │  ORDONNANCEUR SYSTÈME (OS)    │
               │  • Linux/macOS : cron / timer │
               │  • Windows     : schtasks     │
               └───────────────────────────────┘

3. Schéma de la Base de Données (SQLite)

Fichier de base localisé dans ~/.local/share/agent-manager/data.db.
SQL

-- 1. Configuration de l'application & Fournisseurs LLM
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    is_secret INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Registre des modules et outils extensibles
CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    schema_json TEXT NOT NULL,       -- JSON Schema des paramètres pour le LLM
    execution_type TEXT CHECK(execution_type IN ('builtin', 'script', 'binary')),
    entrypoint TEXT NOT NULL,        -- Commande ou chemin vers le script exécutable
    is_enabled INTEGER DEFAULT 1,
    is_auto_generated INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Persistance de la mémoire (Cloisonnement Session / Projet)
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,         -- Hash ou slug du workspace courant
    session_id TEXT,                  -- NULL si scope='project', sinon UUID du run
    scope TEXT CHECK(scope IN ('session', 'project')) NOT NULL,
    key TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, session_id, key)
);

CREATE INDEX IF NOT EXISTS idx_memories_lookup 
ON memories(project_id, scope, key);

-- 4. Tâches planifiées déléguées à l'OS
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    cron_expr TEXT NOT NULL,          -- Format: "0 2 * * *"
    project_id TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_run_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Audit des runs et historique d'exécution
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_id TEXT REFERENCES scheduled_tasks(id) ON DELETE SET NULL,
    prompt TEXT NOT NULL,
    status TEXT CHECK(status IN ('running', 'success', 'failed', 'cancelled')),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS run_traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    step_type TEXT CHECK(step_type IN ('thought', 'tool_call', 'tool_output', 'error', 'answer')),
    tool_name TEXT,
    payload TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

4. Contrats d'Outils Fondamentaux (Noyau Primitif)

L'agent dispose dès son initialisation de 4 primitives système transmises sous forme de tools au format JSON Schema standard :
A. Persistance Abstraite

    store_memory :

JSON

{
  "name": "store_memory",
  "description": "Enregistre une information textuelle ou une règle pour plus tard.",
  "parameters": {
    "type": "object",
    "properties": {
      "key": { "type": "string", "description": "Clé d'identification de la mémoire" },
      "content": { "type": "string", "description": "Contenu textuel/Markdown à stocker" },
      "scope": { 
        "type": "string", 
        "enum": ["session", "project"], 
        "description": "'session' pour le travail en cours, 'project' pour une règle permanente" 
      }
    },
    "required": ["key", "content", "scope"]
  }
}

    recall_memory :

JSON

{
  "name": "recall_memory",
  "description": "Récupère le contenu associé à une clé.",
  "parameters": {
    "type": "object",
    "properties": {
      "key": { "type": "string", "description": "Clé recherchée" }
    },
    "required": ["key"]
  }
}

B. Gestion de l'Imprévu & Auto-Enrichissement

    sandbox_exec :

JSON

{
  "name": "sandbox_exec",
  "description": "Exécute un script éphémère (Python, Bash, JS) dans un environnement confiné pour résoudre une tâche inédite non couverte par les outils existants.",
  "parameters": {
    "type": "object",
    "properties": {
      "runtime": { "type": "string", "enum": ["python", "bash", "node"] },
      "code": { "type": "string", "description": "Code source complet à exécuter" },
      "timeout_sec": { "type": "integer", "default": 20 }
    },
    "required": ["runtime", "code"]
  }
}

    register_tool :

JSON

{
  "name": "register_tool",
  "description": "Enregistre durablement un script validé au registre des outils disponibles pour les futures sessions.",
  "parameters": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Nom unique du module (snake_case)" },
      "description": { "type": "string", "description": "Description fonctionnelle de l'outil pour le LLM" },
      "schema_json": { "type": "string", "description": "JSON Schema des arguments acceptés" },
      "code": { "type": "string", "description": "Code source de l'outil" },
      "runtime": { "type": "string", "enum": ["python", "bash", "node"] }
    },
    "required": ["name", "description", "schema_json", "code", "runtime"]
  }
}

5. Mécanisme de Planification Délégué (Cron / Systemd)

Pour planifier sans démon :

    L'utilisateur (ou l'agent) enregistre une tâche avec une expression cron (ex: 0 2 * * *) via l'UI.

    Le système synchronise la table scheduled_tasks avec le planificateur de l'OS :

        Linux / macOS : Mise à jour de la crontab utilisateur :
        Extrait de code

        0 2 * * * /usr/local/bin/agent run --task-id task_abc123 --non-interactive >> ~/.local/share/agent-manager/cron.log 2>&1

        Windows : Déclaration via schtasks.exe /Create.

    À l'heure dite, l'OS exécute le runner CLI :

        Le runner lit le prompt de task_abc123 dans SQLite.

        Il exécute la boucle ReAct, enregistre les traces dans la table runs.

        Il met à jour last_run_at et se coupe.

6. Interface Utilisateur (Vanilla JS & CSS Moderne)
Choix Technologique

    Zero-Build & Durabilité : Pas de bundler (Webpack/Vite), pas de dépendances NPM lourdes. Fichiers servis directement par un serveur local minimaliste (ou intégrés dans une Webview légère type Tauri / pywebview).

    Web Components : Encapsulation native via Custom Elements (class extends HTMLElement).

    CSS Natif Moderne : Utilisation de CSS Variables (theming dark/light), CSS Grid/Flexbox pour la mise en page, et imbrication native (CSS Nesting).

Arborescence UI
Plaintext

ui/
├── index.html                   # Conteneur principal (Layout CSS Grid)
├── css/
│   ├── variables.css            # Thème de couleurs, typographie, espacements
│   ├── layout.css               # Structure des volets (Sidebar, Main, Inspector)
│   └── components.css           # Styles des cartes, boutons et formulaires
└── js/
    ├── app.js                   # Contrôleur général et routage par onglets
    ├── store.js                 # État local et requêtes fetch vers SQLite / IPC
    └── components/
        ├── run-console.js       # Composant <run-console> : terminal et flux ReAct
        ├── memory-grid.js       # Composant <memory-grid> : tableau d'édition SQLite
        ├── task-planner.js      # Composant <task-planner> : configuration des tâches cron
        └── settings-view.js     # Composant <settings-view> : sélecteur Ollama/API

Modules UI Spécifiques
Menu LLM (<settings-view>)

    Au chargement, lance une requête sur http://localhost:11434/api/tags.

    Remplit automatiquement le menu déroulant avec les modèles Ollama locaux disponibles.

    Propose un basculeur vers les endpoints distants avec champ masqué pour la clé API.

Console de Run (<run-console>)

    Rendu en streaming des événements d'exécution (événements Server-Sent Events ou stream stdio).

    Séparation visuelle claire entre les réflexions internes (thought), les appels d'outils (tool_call), les retours systèmes (tool_output) et la réponse finale.

Planificateur (<task-planner>)

    Formulaire de saisie : Nom, Expression Cron, Dossier cible, Prompt.

    Visualisation des dernières exécutions issues de la table runs pour inspecter le résultat des lancements automatiques nocturnes.

7. Cycle de Vie d'un Run (Exécution CLI)
Plaintext

1. INVOCATION CLI
   `agent run "Nettoie les branches Git" --project /chemin/du/repo`

2. INITIALISATION
   • Dérivation du project_id (hash du chemin absolu)
   • Chargement des app_settings (Ollama vs API distante)
   • Découverte des outils actifs (tools WHERE is_enabled = 1)
   • Injection de la mémoire projet existante (scope = 'project')

3. BOUCLE DE TRAVAIL (ReAct Loop)
   • Envoi du prompt + déclarations d'outils au LLM
   • Si réponse texte finale : Fin de boucle
   • Si tool_calls :
       - Interception de la commande
       - Si builtin (store/recall) : Exécution SQL immédiate
       - Si script enregistré : Spawning du subprocess avec I/O JSON
       - Si sandbox_exec : Exécution isolée du code improvisé
       - Injection du résultat dans l'historique et reprise de la boucle

4. CLÔTURE & PERSISTANCE
   • Insertion des étapes dans run_traces
   • Mise à jour de la table runs (status = 'success', completed_at = now)
   • Fermeture de la connexion SQLite
   • Fin du processus (exit 0)