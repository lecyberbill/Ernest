# Cahier des Charges Technique & Fonctionnel (CDC)
## Module de Gouvernance Déterministe d'Agent par Invariants Cryptographiques

---

### 1. Objectifs & Philosophie d'Ingénierie

Ce module transforme l'IDE en une **barrière de contrôle déterministe** encadrant l'agent de code. L'objectif est d'éliminer la complaisance stochastique du LLM, l'illusion du code cosmétique et la dérive d'alignement au cours des sessions de développement longues.

#### Principes Fondamentaux
1. **Contrôle Asymétrique :** L'agent ne s'auto-évalue jamais par complaisance textuelle. L'arbitre est exclusivement la machine (compilateur, parseur AST, sondes d'exécution et analyseurs dynamiques).
2. **Invariants Scellés :** Le contrat d'interface et d'invariants est scellé sous empreinte cryptographique SHA-256 et verrouillé au niveau du système de fichiers (`chmod 444`). L'agent ne possède aucun droit d'écriture direct sur ce fichier.
3. **Shadow Execution Obligatoire :** Aucun patch de code n'atteint l'espace de travail réel sans avoir validé l'intégralité de ses sondes en environnement isolé (`git worktree`).
4. **Mutations Auditées :** Toute modification de contrat fait l'objet d'une transaction d'outil explicite, d'une validation humaine du diff et d'un enregistrement immuable dans un journal d'audit append-only.

---

### 2. Architecture de la Machine à États (FSM)

L'IDE pilote une machine à trois modes exclusifs définissant dynamiquement les permissions et les outils injectés dans le payload de l'agent.

```
                    ┌─────────────────────────┐
                    │     Initialisation      │
                    │   (.ide/policy.json)    │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
  [ MODE 1 : NORMAL ]   [ MODE 3 : ARCHI ]      [ MODE 2 : CONTRAINT ]
  Tools :               Tools :                 Tools :
  - read_file           - read_file             - read_file
  - write_file          - propose_spec          - write_code (Shadow Hook)
  - run_terminal        - submit_invariants     - request_contract_mutation
  - apply_diff          - request_review        - report_checkpoint_status
                        (ZÉRO WRITE CODE)       - query_invariants
```

#### Transition Mode 3 $\to$ Mode 2
1. L'agent formalise les contrats via `submit_invariants`.
2. L'agent sollicite la validation via `request_review`.
3. L'humain approuve le récapitulatif dans l'UI de l'IDE.
4. L'IDE écrit `.ide/invariants.json`, calcule le SHA-256, écrit `.ide/invariants.lock` (`chmod 444`), bascule `policy.json` en `"mode": "constrained"` et recharge dynamiquement le catalogue d'outils.

---

### 3. Schémas de Données & Formats Fichiers

#### 3.1. `.ide/policy.json` (Configuration workspace)
```json
{
  "version": "1.0.0",
  "mode": "constrained",
  "invariants_file": ".ide/invariants.json",
  "lock_file": ".ide/invariants.lock",
  "audit_log": ".ide/audit.log",
  "shadow_env": {
    "engine": "git_worktree",
    "path": ".ide/shadow_worktree",
    "timeout_ms": 15000
  },
  "guardrails": {
    "max_consecutive_failures": 3,
    "topological_enforcement": true
  }
}
```

#### 3.2. `.ide/invariants.json` (Spécification des Contrats)
Chaque contrat lie une cible, un score de criticité (C0 à C3), des invariants et des sondes polymorphes.

```json
{
  "schema_version": "1.0.0",
  "project_id": "core-engine",
  "contracts": [
    {
      "id": "contract_allocator",
      "criticality": "C3",
      "target_file": "src/allocator.rs",
      "dependencies": [],
      "symbols": [
        {
          "name": "allocate_aligned",
          "signature": "pub fn allocate_aligned(size: usize, align: usize) -> Result<NonNull<u8>, AllocError>",
          "preconditions": [
            "size > 0",
            "align.is_power_of_two()"
          ],
          "postconditions": [
            "ret.as_ptr() as usize % align == 0"
          ]
        }
      ],
      "probes": [
        {
          "probe_id": "probe_ast_signature",
          "runner": "static_ast",
          "query": "function_item name: 'allocate_aligned' params: ['size', 'align']",
          "expect": { "matches": true }
        },
        {
          "probe_id": "probe_alloc_tests",
          "runner": "cli_exec",
          "command": "cargo test --test test_alloc -- --exact",
          "expect": { "exit_code": 0 }
        }
      ]
    }
  ]
}
```

#### 3.3. `.ide/invariants.lock` (Sceau Cryptographique)
```json
{
  "target_file": ".ide/invariants.json",
  "algorithm": "sha256",
  "hash": "a4b2c1789e90f2384a56b6c2d4e3f1a0987654321fedcba0987654321abcdef0",
  "sealed_at": "2026-11-11T10:00:00Z"
}
```

#### 3.4. `.ide/audit.log` (Journal d'audit append-only)
Enregistrement séquentiel de toutes les mutations appliquées aux contrats :
```json
{
  "event_id": "evt_001",
  "timestamp": "2026-11-11T10:05:00Z",
  "initiator": "developer_via_prompt",
  "target_invariant_id": "contract_allocator",
  "reason": "Ajout de la vérification d'alignement puissance de deux",
  "previous_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "new_hash": "a4b2c1789e90f2384a56b6c2d4e3f1a0987654321fedcba0987654321abcdef0",
  "diff": "--- a/.ide/invariants.json\n+++ b/.ide/invariants.json\n@@ -10,3 +10,4 @@\n+ \"align.is_power_of_two()\"",
  "approved_by": "developer"
}
```

---

### 4. Spécification des Outils de l'Agent (Tool Calling Interface)

#### 4.1. `write_code` (Actif uniquement en Mode 2)
Intercepteur d'écriture exécuté sous contrôle shadow.
```json
{
  "name": "write_code",
  "description": "Applique un patch de code sur le projet. Le patch est immédiatement testé contre les sondes d'invariants dans un environnement isolé avant d'être validé.",
  "parameters": {
    "type": "object",
    "properties": {
      "target_file": { "type": "string" },
      "patch": { "type": "string", "description": "Diff unifié ou contenu complet à écrire" },
      "target_contract_id": { "type": "string", "description": "Identifiant du contrat d'invariant satisfait" }
    },
    "required": ["target_file", "patch", "target_contract_id"]
  }
}
```

#### 4.2. `request_contract_mutation` (Actif en Mode 2)
Permet à l'agent de traduire un besoin de refactoring en transaction formelle auprès de l'IDE.
```json
{
  "name": "request_contract_mutation",
  "description": "Sollicite une modification du contrat d'invariants scellé auprès de l'IDE et du développeur.",
  "parameters": {
    "type": "object",
    "properties": {
      "target_contract_id": { "type": "string" },
      "initiator": { "type": "string", "enum": ["developer_request", "agent_bottleneck"] },
      "reason": { "type": "string", "description": "Justification technique détaillée" },
      "diff": { "type": "string", "description": "Diff unifié à appliquer sur invariants.json" },
      "updated_probes": {
        "type": "array",
        "items": { "type": "object" },
        "description": "Nouvelles sondes ou sondes modifiées"
      }
    },
    "required": ["target_contract_id", "initiator", "reason", "diff"]
  }
}
```

#### 4.3. `report_checkpoint_status` (Point de Contrôle Réflexif)
Déclenché obligatoirement après 3 échecs consécutifs sur une sonde.
```json
{
  "name": "report_checkpoint_status",
  "description": "Exécuté obligatoirement après 3 échecs consécutifs sur une sonde. Fournit l'autopsie d'erreur et la stratégie avant d'obtenir l'autorisation de continuer.",
  "parameters": {
    "type": "object",
    "properties": {
      "failed_probe_id": { "type": "string" },
      "consecutive_failures": { "type": "integer" },
      "root_cause_analysis": {
        "type": "string",
        "description": "Explication technique détaillée de la cause racine des 3 échecs passés"
      },
      "next_attempt_strategy": {
        "type": "string",
        "description": "Ce qui sera fait différemment au 4e essai pour garantir la conformité"
      },
      "request_type": {
        "type": "string",
        "enum": ["authorize_retry_4", "need_human_help", "suggest_contract_mutation"]
      }
    },
    "required": ["failed_probe_id", "root_cause_analysis", "next_attempt_strategy", "request_type"]
  }
}
```

#### 4.4. `query_invariants` (Consultation ciblée)
Permet d'extraire les invariants sans saturer la fenêtre de contexte.
```json
{
  "name": "query_invariants",
  "description": "Consulte les invariants et signatures publiques d'un module spécifique du projet.",
  "parameters": {
    "type": "object",
    "properties": {
      "target_file_or_symbol": { "type": "string" }
    },
    "required": ["target_file_or_symbol"]
  }
}
```

---

### 5. Mécanismes d'Exécution & Moteur Interne de l'IDE

#### 5.1. Vérification d'Intégrité Pré-Écriture
À chaque invocation de `write_code` :
1. Calcul : $H_{\text{current}} = \text{SHA-256}(\text{read}(\text{".ide/invariants.json"}))$.
2. Comparaison avec la valeur stockée dans `.ide/invariants.lock`.
3. Si $H_{\text{current}} \neq H_{\text{lock}}$ : arrêt immédiat avec levée d'exception `INTEGRITY_VIOLATION`. Aucun code n'est généré ni inspecté.

#### 5.2. Isolation par Shadow Sandbox (`git worktree`)
Pour tester un patch sans polluer le workspace actif :
1. L'IDE initialise un worktree Git temporaire :
   ```bash
   git worktree add --detach .ide/shadow_worktree HEAD
   ```
2. L'IDE applique le patch fourni par `write_code` dans ce worktree.
3. Résolution de l'ordre topologique : si le contrat ciblé dépend d'autres contrats non encore validés, l'IDE bloque avec `DEPENDENCY_UNSATISFIED`.

#### 5.3. Exécution Polymorphe des Sondes
Selon le `runner` déclaré dans le contrat :
* **`static_ast` :** Exécution d'une requête syntaxique en mémoire (AST via tree-sitter ou analyseur de langage). Durée typique : $< 10\text{ ms}$.
* **`cli_exec` :** Exécution de la commande système dans le dossier `.ide/shadow_worktree`. Surveillance du code de retour (`exit_code`) et respect du `timeout_ms`.
* **`memory_sanitizer` :** Exécution sous harnais mémoire ou dynamic sanitizer (Miri, ASAN, TSAN).

**Résultat des sondes :**
* *Succès global :* Le patch est appliqué sur l'espace de travail réel (`workspace`), le worktree shadow est nettoyé, et l'IDE renvoie `{"status": "SUCCESS"}` à l'agent.
* *Échec :* Le worktree shadow est réinitialisé (`git reset --hard`), l'espace de travail réel reste strictement inchangé, et le compteur d'échecs `failure_count[probe_id]` est incrémenté.

#### 5.4. Gestion du Seuil d'Échecs & Checkpoint Réflexif
1. Si `failure_count[probe_id] < 3` :
   * L'IDE renvoie la trace brute machine (`stderr`, panic trace, AST mismatch) à l'agent avec l'instruction de corriger.
2. Si `failure_count[probe_id] == 3` :
   * L'outil `write_code` est immédiatement désactivé pour la session.
   * L'IDE injecte une directive système d'interruption :
     > *« Seuil critique : 3 échecs consécutifs sur la sonde [probe_id]. Appelez impérativement `report_checkpoint_status` pour fournir votre diagnostic de cause racine et votre stratégie d'action avant toute reprise. »*
   * Dès réception de l'appel `report_checkpoint_status` :
     * Si l'agent demande `authorize_retry_4` avec un diagnostic solide : l'UI IDE affiche la carte de contrôle au développeur avec le bouton **[ Autoriser l'essai #4 ]**.
     * Si le dev valide : `write_code` est réactivé pour exactement une tentative.
     * Si l'agent demande `need_human_help` ou `suggest_contract_mutation` : l'IDE bascule la main au développeur dans le panneau de chat.

---

### 6. Flux d'Audit et Mutation de Contrat par Prompt

Quand une évolution de contrat intervient (par l'humain ou l'agent) :
1. L'agent génère `request_contract_mutation`.
2. L'IDE suspend l'agent et ouvre le composant d'approbation visuel :
   * Affichage du motif : *"Demande développeur : ... "* ou *"Impasse technique agent : ... "*.
   * Visualisation du diff coloré sur `invariants.json`.
3. Validation par l'utilisateur :
   * L'IDE applique le diff atomiquement sur `.ide/invariants.json`.
   * L'IDE recalcule le SHA-256 et écrase `.ide/invariants.lock`.
   * L'IDE ajoute une entrée JSON à la fin de `.ide/audit.log`.
   * L'IDE renvoie le statut `MUTATION_SEALED` à l'agent avec le nouveau hash.
   * L'agent procède à l'implémentation du code correspondant.