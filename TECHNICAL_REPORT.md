# TECHNICAL_REPORT - Hernest

## Contexte
Projet : Assistant Agentique Modulaire Local-First (Sans Démon).
Date de gel des invariants : 2026-11-03
Hash de gel : `3e9040714380fb182237bc698e4bc5cb3790186e613449e4955866fb5db6be79`

## État des Invariants (Gelé & Vérifié)
| ID | Statut | Sonde exécutée | Verdict |
|---|---|---|---|
| INV-01-SCHEMA-SQLITE | OK | `python -c "..."` vérification des 6 tables | OK |
| INV-02-NO-DAEMON | OK | `python -m hernest.cli run ... --test-dry-run` | OK |
| INV-03-CORE-TOOLS-SCHEMA | OK | `python -c "..."` 4 primitives validées | OK |
| INV-04-STORE-RECALL-MEMORY-ISOLATION | OK | `pytest tests/test_memory_primitives.py -q` | OK |
| INV-05-SANDBOX-EXECUTION | OK | `pytest tests/test_sandbox.py -q` | OK |
| INV-06-REGISTER-TOOL-PERSISTENCE | OK | `pytest tests/test_tool_registration.py -q` | OK |
| INV-07-EXPLICIT-FAILURE | OK | `pytest tests/test_explicit_failure.py -q` | OK |
| INV-08-NO-UNAUTHORIZED-EXTERNAL-PROCESS | OK | `python -c "..."` audit regex de non-contournement | OK |
| INV-09-ZERO-BUILD-VANILLA-UI | OK | `python -c "..."` vérification fichiers vanilla UI | OK |
| INV-10-OS-SCHEDULER-DELEGATION | OK | `pytest tests/test_os_scheduler.py -q` | OK |

## Changelog
- 2026-11-03 : Initialisation et gel de `invariants.json` (`3e9040714380fb182237bc698e4bc5cb3790186e613449e4955866fb5db6be79`).
- 2026-11-03 : Implémentation du schéma SQLite et de la couche persistance (`hernest/db/`).
- 2026-11-03 : Implémentation des primitives agentiques (`store_memory`, `recall_memory`, `sandbox_exec`, `register_tool`).
- 2026-11-03 : Implémentation de la sandbox confinée multi-runtimes (`hernest/tools/sandbox.py`).
- 2026-11-03 : Implémentation de l'ordonnanceur délégué à l'OS (`schtasks.exe` et `crontab`).
- 2026-11-03 : Implémentation du client LLM unifié et du moteur ReAct Run-to-Completion (`hernest/engine/react.py`).
- 2026-11-03 : Implémentation de l'interface cockpit Vanilla Web Components dans `ui/`.
- 2026-11-03 : Validation intégrale de la suite de 13 tests unitaires et des 10 sondes d'invariants.
