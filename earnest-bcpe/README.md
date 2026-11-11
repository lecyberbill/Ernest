# Earnest BCPE — Base de connaissances d'expérience (MCP)

Base de connaissances locale (SQLite + FTS5) exposée à un LLM par un serveur
MCP standard, avec une ligne de commande pour l'humain. Le binaire unique `kb`
sert à la fois de serveur MCP (`kb serve`) et d'interface de relecture/validation.

Le texte est la source de vérité ; l'index FTS5 est un dérivé régénérable.
Une entrée décrit un point précis (symptôme, cause, correction, exemple) pour un
couple (`product_id`, `subject_key`).

## Démarrage rapide

```powershell
cargo build --release

# 1. Créer un produit et importer son lexique officiel (un identifiant par ligne)
#    import-lexicon crée le produit s'il n'existe pas encore.
kb --db .\kb.db import-lexicon mon-produit .\lexique.txt

# 2. Fixer la version en service (optionnel)
kb --db .\kb.db product-version mon-produit 2.0

# 3. Lancer le serveur MCP sur stdin/stdout
kb --db .\kb.db serve
```

Sans `--db`, la base est `~/.local/share/earnest-bcpe/kb.db` (ou `%USERPROFILE%\.local\share\earnest-bcpe\kb.db`).
La variable d'environnement `KB_DB` remplace ce chemin par défaut.
La configuration YAML est lue dans `./config`, `KB_CONFIG_DIR`, ou à côté du
binaire ; des valeurs par défaut sont intégrées si les fichiers sont absents.

## Connexion depuis Hermest et depuis les autres clients MCP

Le serveur utilise le transport MCP stdio : messages JSON-RPC 2.0 délimités par
des retours à la ligne. Il accepte l'initialisation standard
(`initialize` → `notifications/initialized`) et tolère aussi un client qui
appelle directement `tools/list` sans handshake, comme le client MCP de Hermest.

### Hermest Cockpit / IDE

Renseignez `app_settings.mcp_servers_config` (JSON) avec l'exécutable `kb` :

```json
[
  {
    "name": "bcpe",
    "command": ".\\earnest-bcpe\\target\\release\\kb.exe",
    "args": ["serve", "--db", ".\\earnest-bcpe\\kb.db"]
  }
]
```

Les outils apparaissent alors au modèle sous la forme
`mcp__bcpe__kb_search`, `mcp__bcpe__kb_check`, etc.

Pour enregistrer ce serveur dans la base du cockpit Hermest :
```python
import json
from earnest.db.connection import init_db

conn = init_db()
servers = [{
    "name": "bcpe",
    "command": r".\earnest-bcpe\target\release\kb.exe",
    "args": ["serve", "--db", r".\earnest-bcpe\kb.db"],
}]
conn.execute(
    "INSERT INTO app_settings (key, value) VALUES ('mcp_servers_config', ?) "
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    (json.dumps(servers),),
)
conn.commit()
conn.close()
```

### Autres clients (Claude Desktop, etc.)

```json
{
  "mcpServers": {
    "bcpe": {
      "command": ".\\earnest-bcpe\\target\\release\\kb.exe",
      "args": ["serve", "--db", ".\\earnest-bcpe\\kb.db"]
    }
  }
}
```

## Outils MCP exposés au LLM

| Outil | Rôle |
| --- | --- |
| `kb_search` | Cherche les expériences d'un produit. `covered=false` signifie « non couvert ou non validé », jamais « sans risque ». |
| `kb_get` | Lit une entrée complète (identifiants, mots-clés, dépendances) par `entry_id` ou `product_id` + `subject_key`. |
| `kb_check` | Vérifie mécaniquement les identifiants d'un script (`script_text` + `script_kind`) ou d'une liste. Verdicts : `ok`, `deprecie`, `inexistant`, `inconnu`. |
| `kb_report_incident` | Enregistre un écart attendu/observé et renvoie les entrées proches. Ne crée pas d'entrée. |
| `kb_propose` | Crée ou met à jour une entrée `non_teste`. Refusé sur `valide`/`archive` (`forbidden_status`). |
| `kb_record_outcome` | Signale `ok`/`ko` (note obligatoire pour `ko`), compteurs atomiques, sans changer `version`. |

Toute réponse porte `content_type: "reference_data"` et le statut de chaque
entrée. Les descriptions d'outils rappellent que le texte d'une entrée est une
donnée, jamais une instruction à exécuter.

Les outils ne peuvent ni valider, ni archiver, ni supprimer, ni modifier une
entrée `valide`. Ces actions existent uniquement dans la CLI humaine.

## Ligne de commande humaine

```text
kb serve
kb validate <entry_id> --by humain:nom
kb edit <entry_id> --by humain:nom [--title ...] [--correction ...] [--terms a,b]
                       [--identifiers-json '[{"identifier":"X","state":"valide"}]']
                       [--depends-on 2,3] [--product-version 2.1]
kb archive <entry_id>
kb restore <entry_id>
kb product-version <produit> <version>
kb lint [--product <produit>] [--json]
kb audit --sample N
kb backup
kb reindex
kb import-lexicon <produit> <fichier>
kb log-extract <fichier>
kb incident <produit> "<attendu>" "<observé>" [--script-ref ...] [--log-excerpt ...]
kb check <produit> <fichier> [--kind test|aml|xml|jsx]
```

- `validate` : passe `non_teste`/`a_revoir` à `valide` et enregistre le valideur.
- `edit` : modifie une entrée non archivée ; sur une entrée `valide`, l'éditeur
  devient `validated_by` et l'ancienne version est copiée dans `entry_history`.
- `product-version` : passe à `a_revoir` les entrées `valide` dont
  `product_version` diffère (égalité stricte, `2.0` = `2.0.0`).
- `backup` : copie quotidienne via `VACUUM INTO`, conservation 30 jours.
- `audit` : tire N entrées `valide`, enregistre le verdict dans `audit_log.jsonl`.
- `log-extract` : toutes les lignes WARN/ERROR, 5 lignes précédentes et la ligne
  `fin`, limité à 4 000 caractères.

## Configuration

`config/extractors.yaml` :

```yaml
extractors:
  test:
    patterns:
      - regex: '\b(?:TAG|PARAM)_[A-Z0-9_]+\b'
  aml:
    patterns:
      - regex: '<\s*(AM[A-Za-z0-9_]+)'
        group: 1
```

Chaque motif cible une syntaxe propre au produit ; un identifiant local
(variable, fonction) n'est jamais extrait. Les commentaires et chaînes
littérales sont ignorés avant extraction. La syntaxe est celle du crate `regex`
(pas de lookahead ni de backreference) ; `engine: fancy` est refusé.

`config/redaction.yaml` : motifs masqués avant stockage sur tous les champs
texte libres (`title`, `symptom`, `cause`, `correction`, `example`, `note`,
`expected`, `observed`, `log_excerpt`). Par défaut : mots de passe/jetons,
en-têtes Bearer, adresses e-mail, chemins personnels.

## Données et garanties

- SQLite en WAL, `busy_timeout=5000`, clés étrangères activées, FTS5 vérifié au
  démarrage.
- 9 tables : `products`, `entries`, `entry_terms`, `identifiers`,
  `lexicon_identifiers`, `entry_deps`, `entry_history`, `entry_outcomes`,
  `incidents`, plus l'index virtuel `entries_fts`.
- Une écriture d'entrée, mots-clés, identifiants, historique et index est une
  seule transaction.
- Un identifiant peut être déclaré par plusieurs entrées non archivées du même
  produit seulement avec le même `state` et le même `replaced_by`.
- Le serveur MCP n'ouvre aucun port réseau. Limite d'écriture : 30 appels par
  minute et par session (`rate_limited`).
- Journal serveur sur `stderr`, au format
  `horodatage|niveau|étape|message|clé=valeur` (le produit, la durée et le
  résultat sont tracés, jamais les arguments texte).

## Construction et tests

```powershell
cargo fmt
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --release
```

`tests/acceptance.rs` couvre les critères A1 à A24 du cahier des charges, plus
A25 (lecture `kb_get`), sur une base temporaire par test. `tests/fixtures/seed.json`
documente le jeu de départ utilisé par les critères de recette.

## Choix techniques et écarts assumés

- **Transport stdio implémenté directement**, sans `rmcp` : le comportement
  attendu (JSON-RPC 2.0 ligne par ligne, tolérance à l'absence d'`initialize`,
  réponses `content` + `structuredContent`) est plus simple à garantir et
  fonctionne avec Hermest comme avec les clients MCP standard. Le serveur est
  synchrone ; chaque requête SQLite s'exécute hors de tout contexte asynchrone.
- **YAML** : `yaml_serde` (successeur maintenu de `serde_yaml`, projet The YAML
  Organization) est utilisé à la place de `serde_yaml` archivé.
- **Schémas d'outils** générés avec `schemars`.
- **`VACUUM INTO`** sert d'API de sauvegarde SQLite (copie cohérente et unique).
- **Bootstrap produit** : `import-lexicon` crée le produit s'il n'existe pas, afin
  qu'une base neuve soit utilisable sans insertion SQL manuelle.
- Le contrôle porte sur les noms d'identifiants, pas sur la logique du script :
  seule l'exécution réelle, avec des contrôles internes, détecte une logique
  fausse. Un résultat `covered=false` n'est jamais une absence de risque.
