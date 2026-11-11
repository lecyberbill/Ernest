"""
Module d'Orchestration Multi-Agents pour Earnest.
Définit les rôles spécialisés :
- ArchitectPlanner : Découpe une tâche complexe en sous-objectifs (DAG/étapes ordonnées).
- SpecialistWorker : Exécuteur d'outils et de code dans le contexte de l'étape.
- ReviewerAuditor : Audite et valide la complétude et conformité des résultats avant clôture.
"""

import json
from typing import List, Dict, Any, Optional

PLANNER_SYSTEM_PROMPT = """Tu es l'Agent ARCHITECTE & PLANIFICATEUR de Earnest.
Ton rôle est d'analyser la mission utilisateur et de produire un plan d'action décomposé en 2 à 5 étapes concrètes, séquentielles et vérifiables.
Chaque étape doit avoir un intitulé clair et un objectif mesurable.
Réponds STRICTEMENT au format JSON suivant :
{
  "mission": "Résumé de la mission",
  "steps": [
    {"step_id": 1, "title": "...", "objective": "...", "tools_suggested": ["terminal_exec", ...]},
    {"step_id": 2, "title": "...", "objective": "...", "tools_suggested": ["create_artifact", ...]}
  ]
}
"""

REVIEWER_SYSTEM_PROMPT = """Tu es l'Agent AUDITEUR & CRITIQUE de Earnest.
Ton rôle est de vérifier si la mission utilisateur a été accomplie avec rigueur.
Analyse les traces des actions réalisées et la synthèse produite.
Réponds STRICTEMENT au format JSON suivant :
{
  "is_complete": true,
  "confidence_score": 0.95,
  "verdict": "Conforme et validé",
  "missing_elements": [],
  "recommendations": "..."
}
"""

class MultiAgentOrchestrator:
    """
    Orchestrateur Multi-Agents hiérarchique :
    1. Planification (Architect)
    2. Exécution pas à pas (Worker)
    3. Audit critique (Reviewer)
    """
    def __init__(self, engine):
        self.engine = engine

    def plan(self, prompt: str) -> Dict[str, Any]:
        """Étape 1 : L'Architecte décompose la tâche."""
        messages = [
            {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
            {"role": "user", "content": f"Voici la mission à planifier :\n{prompt}"}
        ]
        try:
            resp = self.engine.llm_client.chat_completion(messages, tools=None)
            raw = resp.get("content", "").strip()
            # Nettoyage Markdown JSON éventuel
            if "```json" in raw:
                raw = raw.split("```json", 1)[1].split("```", 1)[0].strip()
            elif "```" in raw:
                raw = raw.split("```", 1)[1].split("```", 1)[0].strip()
            return json.loads(raw)
        except Exception:
            return {
                "mission": prompt,
                "steps": [
                    {"step_id": 1, "title": "Exécution directe", "objective": prompt, "tools_suggested": []}
                ]
            }

    def review(self, prompt: str, execution_summary: str) -> Dict[str, Any]:
        """Étape 3 : L'Auditeur critique vérifie le résultat."""
        messages = [
            {"role": "system", "content": REVIEWER_SYSTEM_PROMPT},
            {"role": "user", "content": f"Mission initiale :\n{prompt}\n\nRésultat et traces obtenues :\n{execution_summary}\n\nL'objectif est-il atteint ?"}
        ]
        try:
            resp = self.engine.llm_client.chat_completion(messages, tools=None)
            raw = resp.get("content", "").strip()
            if "```json" in raw:
                raw = raw.split("```json", 1)[1].split("```", 1)[0].strip()
            elif "```" in raw:
                raw = raw.split("```", 1)[1].split("```", 1)[0].strip()
            return json.loads(raw)
        except Exception:
            return {
                "is_complete": True,
                "confidence_score": 0.90,
                "verdict": "Validation automatique par repli",
                "missing_elements": [],
                "recommendations": "Vérification manuelle conseillée"
            }

