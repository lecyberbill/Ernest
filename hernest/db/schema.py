SCHEMA_SQL = """
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
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
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

-- 6. Sessions et Messages du Chat persistant
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    project_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Index Virtuel FTS5 pour recherche sémantique plein texte sur les mémoires
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    key,
    content,
    project_id UNINDEXED,
    content='memories',
    content_rowid='id'
);

-- 8. Fournisseurs et Modèles d'Inférence Déclaratifs (Multi-Fournisseurs Dynamiques)
CREATE TABLE IF NOT EXISTS model_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider_type TEXT CHECK(provider_type IN ('ollama', 'openai', 'anthropic', 'custom')) NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT,                     -- Chiffré DPAPI si présent
    is_enabled INTEGER DEFAULT 1,     -- 1 = Connecté / Actif, 0 = Déconnecté
    priority INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""

