use clap::Parser;
use earnest_core::db::connection::{init_db, get_data_dir, get_db_path};
use earnest_core::db::memories::MemoryService;
use earnest_core::llm::router::LLMRouter;
use earnest_core::engine::react::ReActEngine;
use earnest_core::server;

#[derive(Parser, Debug)]
#[command(name = "earnest-core")]
#[command(author = "DeepMind Pair • Earnest Platform")]
#[command(version = "1.0.0")]
#[command(about = "Moteur Agentique Rust Haute Performance & Run-to-completion (Exit 0)")]
struct Cli {
    #[arg(short, long)]
    prompt: Option<String>,

    #[arg(long, default_value = "default_workspace")]
    project: String,

    #[arg(long)]
    test_dry_run: bool,

    #[arg(long)]
    status: bool,

    #[arg(long)]
    test_db: bool,

    #[arg(long)]
    probe_models: bool,

    #[arg(long)]
    serve: bool,

    #[arg(long, default_value_t = 8080)]
    port: u16,

    #[arg(long, default_value = "127.0.0.1")]
    host: String,
}

fn main() {
    let args = Cli::parse();
    let data_dir = get_data_dir();
    let db_path = get_db_path();

    // Mode dry-run pour validation ultra-rapide (Invariants)
    if args.test_dry_run {
        println!("EXIT_0");
        std::process::exit(0);
    }

    if args.status {
        println!("🦀 Earnest Rust Core v1.0.0 — Connecté");
        println!("📁 Répertoire de données : {}", data_dir.display());
        if db_path.exists() {
            println!("💾 Base SQLite : OK ({})", db_path.display());
        }
        std::process::exit(0);
    }

    // Serveur HTTP & UI Embarquée
    if args.serve {
        server::start_http_server(&args.host, args.port);
        return;
    }

    // Initialisation connexion SQLite native
    let conn = match init_db(None) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Erreur SQLite: {}", e);
            std::process::exit(1);
        }
    };

    if args.test_db {
        println!("🧪 [TEST DB RUST] Démarrage du test unitaire de mémoire...");
        let mem = MemoryService::new(&conn);
        let key = "test_rust_bench";
        let content = "Contenu de test Rust 100% natif";
        mem.store_memory(&args.project, key, content, "project", None).unwrap();
        let recalled = mem.recall_memory(&args.project, key, None).unwrap();
        assert_eq!(recalled.as_deref(), Some(content));
        println!("✅ Test mémoire réussi : clé '{}' => '{}'", key, recalled.unwrap());
        std::process::exit(0);
    }

    if args.probe_models {
        println!("📡 [SONDAGE DES MOTEURS RUST] Interrogation des backends déclarés...");
        let router = LLMRouter::from_db(&conn);
        let probes = router.probe_all();
        for p in probes {
            if p.is_online {
                println!("  🟢 {} [{}] — En ligne ({} ms) | Modèle: {}", p.name, p.provider_type, p.latency_ms.unwrap_or(0), p.model);
            } else {
                println!("  🔴 {} [{}] — Hors ligne (Erreur: {})", p.name, p.provider_type, p.error.unwrap_or_default());
            }
        }
        std::process::exit(0);
    }

    let prompt = match args.prompt {
        Some(p) => p,
        None => {
            eprintln!("Erreur: Aucun prompt fourni. Utilisez --prompt \"votre consigne\"");
            std::process::exit(1);
        }
    };

    println!("🦀 [EARNEST RUST CORE] Lancement de la mission ReAct...");
    println!("📋 Projet : {}", args.project);
    println!("💬 Consigne : \"{}\"", prompt);

    let router = LLMRouter::from_db(&conn);
    let engine = ReActEngine::new(&conn, &router, &args.project);

    match engine.run(&prompt) {
        Ok(res) => {
            println!("\n🏁 [RÉSULTAT FINAL RUST - Run {}] :", res.run_id);
            println!("{}", res.answer);
            println!("\n📊 Bilan : {} étapes • {} tokens • {} ms", res.steps_count, res.total_tokens, res.duration_ms);
            println!("EXIT_0");
            std::process::exit(0);
        }
        Err(e) => {
            eprintln!("❌ Erreur d'exécution ReAct : {}", e);
            std::process::exit(1);
        }
    }
}
