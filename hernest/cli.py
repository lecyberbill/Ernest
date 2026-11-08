import argparse
import sys
import hashlib
from pathlib import Path
from hernest.db.connection import init_db
from hernest.llm.client import UnifiedLLMClient
from hernest.engine.react import ReActEngine

def compute_project_id(project_path: str) -> str:
    abs_path = str(Path(project_path).resolve())
    return hashlib.sha256(abs_path.encode("utf-8")).hexdigest()[:16]

def main():
    parser = argparse.ArgumentParser(description="Hernest CLI Runner (Run-to-completion, sans démon)")
    subparsers = parser.add_subparsers(dest="command")

    run_parser = subparsers.add_parser("run", help="Exécute un prompt agentique")
    run_parser.add_argument("--prompt", type=str, default="", help="Prompt ou tâche à exécuter")
    run_parser.add_argument("--project", type=str, default=".", help="Chemin du workspace projet")
    run_parser.add_argument("--task-id", type=str, default=None, help="ID de la tâche planifiée le cas échéant")
    run_parser.add_argument("--provider", type=str, default="ollama", help="Fournisseur LLM ('ollama' ou 'openai')")
    run_parser.add_argument("--model", type=str, default="llama3:latest", help="Nom du modèle")
    run_parser.add_argument("--base-url", type=str, default=None, help="URL de base du backend LLM")
    run_parser.add_argument("--test-dry-run", action="store_true", help="Sortie immédiate pour test run-to-completion")

    args = parser.parse_args()

    if args.command == "run":
        if args.test_dry_run:
            print("EXIT_0")
            sys.exit(0)

        conn = init_db()
        project_id = compute_project_id(args.project)

        # Si task_id est passé et pas de prompt, charger le prompt depuis scheduled_tasks
        prompt = args.prompt
        if args.task_id and not prompt:
            row = conn.execute("SELECT prompt FROM scheduled_tasks WHERE id = ?", (args.task_id,)).fetchone()
            if row:
                prompt = row["prompt"]
            else:
                print(f"Erreur: Tâche planifiée '{args.task_id}' introuvable.", file=sys.stderr)
                sys.exit(1)

        if not prompt:
            print("Erreur: Aucun prompt fourni.", file=sys.stderr)
            sys.exit(1)

        # Lecture des app_settings pour base_url et modèle par défaut si non spécifiés
        cursor = conn.cursor()
        settings_rows = cursor.execute("SELECT key, value FROM app_settings").fetchall()
        settings_map = {r["key"]: r["value"] for r in settings_rows}

        base_url = args.base_url or settings_map.get("ollama_base_url")
        model = args.model if args.model != "llama3:latest" else settings_map.get("default_model", args.model)

        llm_client = UnifiedLLMClient(provider=args.provider, model=model, base_url=base_url)
        engine = ReActEngine(conn=conn, project_id=project_id, llm_client=llm_client)

        try:
            res = engine.run(prompt=prompt, task_id=args.task_id)
            if args.task_id:
                with conn:
                    conn.execute("UPDATE scheduled_tasks SET last_run_at = CURRENT_TIMESTAMP WHERE id = ?", (args.task_id,))
            print(res["answer"])
            sys.exit(0)
        except Exception as e:
            print(f"Erreur d'exécution ReAct: {e}", file=sys.stderr)
            sys.exit(1)
        finally:
            conn.close()
    else:
        parser.print_help()
        sys.exit(0)

if __name__ == "__main__":
    main()

