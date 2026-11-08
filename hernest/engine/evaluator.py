"""
Harnais d'Évaluation Automatisé (Agentic Evals & Benchmarks) pour Hernest.
Fournit une suite de scénarios types avec métriques de réussite, consommation de tokens,
durée d'exécution, conformité des outils et dérives comportementales.
"""

import time
import json
from typing import List, Dict, Any, Optional
from hernest.engine.react import ReActEngine
from hernest.llm.router import LLMFallbackRouter

# Scénarios de référence représentatifs pour mesurer les performances
EVAL_SCENARIOS = [
    {
        "id": "eval_01_direct_reasoning",
        "category": "reasoning",
        "title": "Raisonnement pur et concision",
        "prompt": "Explique en 2 phrases la différence entre un thread système et un processus.",
        "expected_tools": [],
        "validation_keywords": ["mémoire", "espace", "processus", "thread"],
        "max_steps": 3
    },
    {
        "id": "eval_02_memory_roundtrip",
        "category": "tools",
        "title": "Mémorisation et rappel SQLite",
        "prompt": "Mémorise la clé 'test_benchmark_token' avec la valeur 'VAL_987654' puis confirme qu'elle est bien enregistrée.",
        "expected_tools": ["store_memory"],
        "validation_keywords": ["VAL_987654", "enregistré", "mémorisé"],
        "max_steps": 5
    },
    {
        "id": "eval_03_tool_terminal",
        "category": "execution",
        "title": "Exécution de diagnostic système",
        "prompt": "Exécute une commande terminal pour lister les disques ou le répertoire courant et donne le résultat.",
        "expected_tools": ["terminal_exec"],
        "validation_keywords": ["dir", "Répertoire", "Path", "Volume"],
        "max_steps": 5
    },
    {
        "id": "eval_04_artifact_generation",
        "category": "artifacts",
        "title": "Génération d'artefact documentaire",
        "prompt": "Crée un artefact markdown nommé 'benchmark_summary.md' contenant un tableau récapitulatif.",
        "expected_tools": ["create_artifact"],
        "validation_keywords": ["benchmark_summary", "artefact", "créé"],
        "max_steps": 6
    }
]

class AgenticEvaluator:
    """Moteur d'exécution des benchmarks agentiques."""

    def __init__(self, conn, project_id: str = "eval_benchmarks"):
        self.conn = conn
        self.project_id = project_id
        self._ensure_eval_schema()

    def _ensure_eval_schema(self):
        """Crée la table d'historique des benchmarks si elle n'existe pas déjà."""
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS benchmark_eval_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scenario_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    backend TEXT NOT NULL,
                    model TEXT NOT NULL,
                    status TEXT NOT NULL,
                    score REAL NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    steps_count INTEGER NOT NULL,
                    total_tokens INTEGER DEFAULT 0,
                    tools_used TEXT,
                    details TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

    def run_benchmark(self, router: LLMFallbackRouter, scenarios: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Exécute la batterie de tests et calcule le bilan quantitatif."""
        selected_scenarios = scenarios or EVAL_SCENARIOS
        results = []
        start_global = time.perf_counter()

        for sc in selected_scenarios:
            traces = []
            def on_trace(item):
                traces.append(item)

            engine = ReActEngine(
                conn=self.conn,
                project_id=self.project_id,
                llm_client=router,
                trace_callback=on_trace,
                max_iterations=sc.get("max_steps", 6)
            )

            start_t = time.perf_counter()
            run_status = "failed"
            score = 0.0
            error_msg = None
            answer = ""
            usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

            try:
                res = engine.run(sc["prompt"])
                answer = res.get("answer", "")
                usage = res.get("usage") or usage
                run_status = res.get("status", "success")
            except Exception as e:
                error_msg = str(e)
                run_status = "error"

            duration_ms = int((time.perf_counter() - start_t) * 1000)

            # Analyse des outils appelés
            tools_used = [t["tool_name"] for t in traces if t.get("step_type") == "tool_call" and t.get("tool_name")]
            expected_tools = sc.get("expected_tools", [])
            tool_match = all(tool in tools_used for tool in expected_tools)

            # Analyse des mots-clés de validation
            keywords = sc.get("validation_keywords", [])
            found_keywords = [kw for kw in keywords if kw.lower() in answer.lower() or any(kw.lower() in str(t.get("payload", "")).lower() for t in traces)]
            keyword_score = (len(found_keywords) / len(keywords)) if keywords else 1.0

            # Calcul du score pondéré (0.0 à 1.0)
            if run_status == "success":
                tool_score = 1.0 if (not expected_tools or tool_match) else 0.4
                score = round((tool_score * 0.5) + (keyword_score * 0.5), 2)
            else:
                score = 0.0

            active_model = router.get_active_model() if hasattr(router, "get_active_model") else "default"
            active_backend = router.get_active_backend() if hasattr(router, "get_active_backend") else "auto"

            res_entry = {
                "scenario_id": sc["id"],
                "category": sc["category"],
                "title": sc["title"],
                "status": "passed" if score >= 0.7 else "failed",
                "score": score,
                "duration_ms": duration_ms,
                "steps_count": len(traces),
                "tools_used": tools_used,
                "expected_tools": expected_tools,
                "total_tokens": usage.get("total_tokens", 0),
                "backend": str(active_backend),
                "model": str(active_model),
                "error": error_msg
            }
            results.append(res_entry)

            # Persistance SQLite
            with self.conn:
                self.conn.execute("""
                    INSERT INTO benchmark_eval_runs 
                    (scenario_id, category, backend, model, status, score, duration_ms, steps_count, total_tokens, tools_used, details)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    sc["id"],
                    sc["category"],
                    str(active_backend),
                    str(active_model),
                    res_entry["status"],
                    score,
                    duration_ms,
                    len(traces),
                    usage.get("total_tokens", 0),
                    json.dumps(tools_used),
                    json.dumps({"error": error_msg, "answer_preview": answer[:150]})
                ))

        total_duration = round(time.perf_counter() - start_global, 2)
        passed_count = sum(1 for r in results if r["status"] == "passed")
        avg_score = round(sum(r["score"] for r in results) / len(results), 2) if results else 0
        total_tokens = sum(r["total_tokens"] for r in results)

        return {
            "total_scenarios": len(results),
            "passed": passed_count,
            "failed": len(results) - passed_count,
            "success_rate": round((passed_count / len(results)) * 100, 1) if results else 0,
            "average_score": avg_score,
            "total_duration_sec": total_duration,
            "total_tokens_consumed": total_tokens,
            "results": results
        }

    def get_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Récupère l'historique des évaluations précédentes."""
        rows = self.conn.execute("""
            SELECT id, scenario_id, category, backend, model, status, score, duration_ms, steps_count, total_tokens, tools_used, created_at
            FROM benchmark_eval_runs
            ORDER BY id DESC
            LIMIT ?
        """, (limit,)).fetchall()
        return [dict(r) for r in rows]

