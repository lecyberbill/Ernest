# Spécifications Techniques & Architecture : Hernest IDE

Assistant de Programmation Agentique & Environnement de Développement Intégré Local-First.
Fait partie de la gamme **Hernest Platform** aux côtés de **Hernest Cockpit** (Opérations Agentiques).

## 1. Vision & Principes
- **Moteur Rust Léger & Éphémère (`hernest-ide-core`)** : Inférence unifiée avec Ollama / LM Studio / DeepSeek / OpenAI, exécution déterministe ReAct spécialisée dans le code.
- **Zéro Démon Lourd Résident** : Pas de service permanent, démarrage à la demande, exécution de tâches run-to-completion.
- **UI Vanilla Web Components (Zero-Build)** : CSS moderne natif (thème sombre Stitch / Cyberpunk épuré, icônes SVG blanches monochromes), zéro node_modules.
- **Desktop Natif Tauri v2** : Binaire autonome Windows `.exe` ultra-léger (~15 Mo, ~30 Mo RAM).

## 2. Primitives de Code Indispensables (Niveau Claude Code / Antigravity / OpenCode)
1. **`read_file`** : Lecture sécurisée avec numéros de lignes et pagination.
2. **`edit_file`** : Modification chirurgicale par blocs exacts (`target` -> `replacement`).
3. **`write_file`** : Création / écrasement atomique de fichiers.
4. **`list_dir` / `fs_tree`** : Arborescence de projet filtrant les `.git` et `target`.
5. **`grep_search`** : Recherche plein-texte instantanée par regex dans tout le code source.
6. **`terminal_exec`** : Compilation (`cargo`, `python`, `npm`), tests unitaires et commandes shell.

## 3. Ergonomie & Cockpit IDE
- **Volet Explorateur** : Navigation arborescente dans le dossier projet actif.
- **Éditeur Multi-onglets** : Coloration syntaxique temps réel (Rust, Python, JS, HTML, CSS, Markdown).
- **Diff Viewer & Validation HITL** : Visualisation claire des modifications proposées avant validation.
- **Pair-Programming Chat / Session Agent** : Dialogue continu avec l'agent d'ingénierie logicielle.

