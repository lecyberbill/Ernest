use std::io::{self, Write};
use std::path::{Path, PathBuf};

use clap::{Parser, Subcommand};
use rusqlite::Connection;

use crate::config::{default_data_dir, default_db_path, AppConfig};
use crate::core::check::check;
use crate::core::incidents::{log_extract, report_incident};
use crate::core::lifecycle::{
    archive, audit_sample, backup, edit, import_lexicon, lint, product_version, reindex, restore,
    validate, EditPatch,
};
use crate::core::time::now_iso;
use crate::db;
use crate::error::{KbError, KbResult};
use crate::mcp::McpServer;
use crate::models::{CheckInput, IncidentInput};

#[derive(Parser)]
#[command(
    name = "kb",
    version,
    about = "Base de connaissances d'expérience exposee par MCP"
)]
struct Cli {
    #[arg(long, global = true, help = "Chemin du fichier SQLite")]
    db: Option<PathBuf>,
    #[arg(long, global = true, help = "Repertoire de configuration (YAML)")]
    config: Option<PathBuf>,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    #[command(about = "Lance le serveur MCP sur stdin/stdout")]
    Serve,
    #[command(about = "Valide une entree (humain)")]
    Validate {
        entry_id: i64,
        #[arg(long, default_value = "humain:local")]
        by: String,
    },
    #[command(about = "Edite une entree (humain)")]
    Edit {
        entry_id: i64,
        #[arg(long, default_value = "humain:local")]
        by: String,
        #[arg(long)]
        kind: Option<String>,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        symptom: Option<String>,
        #[arg(long)]
        cause: Option<String>,
        #[arg(long)]
        correction: Option<String>,
        #[arg(long)]
        example: Option<String>,
        #[arg(long)]
        product_version: Option<String>,
        #[arg(long, help = "Mots-cles separes par des virgules")]
        terms: Option<String>,
        #[arg(long, help = "JSON: [{\"identifier\":\"X\",\"state\":\"valide\"}]")]
        identifiers_json: Option<String>,
        #[arg(long, help = "IDs d'entrees separes par des virgules")]
        depends_on: Option<String>,
    },
    #[command(about = "Archive une entree (humain)")]
    Archive { entry_id: i64 },
    #[command(about = "Restaure une entree archivee (humain)")]
    Restore { entry_id: i64 },
    #[command(
        name = "product-version",
        about = "Change la version courante d'un produit"
    )]
    ProductVersion { product: String, version: String },
    #[command(about = "Liste les anomalies de la base")]
    Lint {
        #[arg(long)]
        product: Option<String>,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Audit par echantillonnage d'entrees valide")]
    Audit {
        #[arg(long, default_value_t = 10)]
        sample: i64,
    },
    #[command(about = "Copie de sauvegarde quotidienne")]
    Backup,
    #[command(about = "Reconstruit l'index FTS5")]
    Reindex,
    #[command(
        name = "import-lexicon",
        about = "Importe le lexique officiel d'un produit"
    )]
    ImportLexicon { product: String, file: PathBuf },
    #[command(name = "log-extract", about = "Extrait WARN/ERROR d'un journal")]
    LogExtract { file: PathBuf },
    #[command(about = "Enregistre un incident cote humain")]
    Incident {
        product: String,
        expected: String,
        observed: String,
        #[arg(long)]
        script_ref: Option<String>,
        #[arg(long)]
        log_excerpt: Option<String>,
    },
    #[command(about = "Verifie les identifiants d'un fichier de script")]
    Check {
        product: String,
        file: PathBuf,
        #[arg(long, default_value = "test")]
        kind: String,
    },
}

fn open_db(path: &Path) -> KbResult<Connection> {
    let conn = db::open(path)?;
    db::init(&conn)?;
    Ok(conn)
}

fn split_csv(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

pub fn run() -> KbResult<()> {
    let cli = Cli::parse();
    let db_path = cli.db.clone().unwrap_or_else(default_db_path);
    let config = AppConfig::load(cli.config.as_deref())?;

    match cli.command {
        Command::Serve => {
            let conn = open_db(&db_path)?;
            let mut server = McpServer::new(conn, config);
            server.run_stdio()
        }
        Command::Validate { entry_id, by } => {
            let mut conn = open_db(&db_path)?;
            let entry = validate(&mut conn, entry_id, &by)?;
            println!(
                "entree {} validee par {} (statut={})",
                entry.entry_id, by, entry.status
            );
            Ok(())
        }
        Command::Edit {
            entry_id,
            by,
            kind,
            title,
            symptom,
            cause,
            correction,
            example,
            product_version,
            terms,
            identifiers_json,
            depends_on,
        } => {
            let mut conn = open_db(&db_path)?;
            let identifiers = match identifiers_json {
                None => None,
                Some(raw) => Some(
                    serde_json::from_str::<Vec<crate::models::IdentifierInput>>(&raw).map_err(
                        |error| KbError::invalid(format!("identifiers_json invalide: {error}")),
                    )?,
                ),
            };
            let deps = depends_on.as_deref().map(|raw| {
                split_csv(raw)
                    .into_iter()
                    .filter_map(|item| item.parse::<i64>().ok())
                    .collect::<Vec<_>>()
            });
            let patch = EditPatch {
                kind,
                title,
                symptom,
                cause,
                correction,
                example,
                terms: terms.as_deref().map(split_csv),
                identifiers,
                depends_on: deps,
                product_version,
            };
            let entry = edit(&mut conn, &config, entry_id, &patch, &by)?;
            println!(
                "entree {} editee (version={}, statut={})",
                entry.entry_id, entry.version, entry.status
            );
            Ok(())
        }
        Command::Archive { entry_id } => {
            let mut conn = open_db(&db_path)?;
            let entry = archive(&mut conn, entry_id)?;
            println!("entree {} archivee", entry.entry_id);
            Ok(())
        }
        Command::Restore { entry_id } => {
            let mut conn = open_db(&db_path)?;
            let entry = restore(&mut conn, entry_id)?;
            println!(
                "entree {} restauree (statut={})",
                entry.entry_id, entry.status
            );
            Ok(())
        }
        Command::ProductVersion { product, version } => {
            let mut conn = open_db(&db_path)?;
            let updated = product_version(&mut conn, &product, &version)?;
            println!(
                "version de {} = {}; {} entree(s) passee(s) a a_revoir",
                product,
                version,
                updated.len()
            );
            Ok(())
        }
        Command::Lint { product, json } => {
            let conn = open_db(&db_path)?;
            let findings = lint(&conn, product.as_deref())?;
            if json {
                println!("{}", serde_json::to_string_pretty(&findings)?);
            } else if findings.is_empty() {
                println!("aucune anomalie");
            } else {
                for finding in &findings {
                    println!(
                        "[{}] produit={} entree={:?} identifiant={:?} {}",
                        finding.category,
                        finding.product_id,
                        finding.entry_id,
                        finding.identifier,
                        finding.detail
                    );
                }
            }
            Ok(())
        }
        Command::Audit { sample } => run_audit(&db_path, sample),
        Command::Backup => {
            let conn = open_db(&db_path)?;
            let data_dir = db_path
                .parent()
                .map(|parent| parent.to_path_buf())
                .unwrap_or_else(default_data_dir);
            let path = backup(&conn, &data_dir)?;
            println!("sauvegarde: {}", path.display());
            Ok(())
        }
        Command::Reindex => {
            let mut conn = open_db(&db_path)?;
            let count = reindex(&mut conn)?;
            println!("index reconstruit pour {count} entree(s)");
            Ok(())
        }
        Command::ImportLexicon { product, file } => {
            let mut conn = open_db(&db_path)?;
            let count = import_lexicon(&mut conn, &product, &file)?;
            println!("{count} identifiant(s) importe(s) pour {product}");
            Ok(())
        }
        Command::LogExtract { file } => {
            let extract = log_extract(&file)?;
            println!("{extract}");
            Ok(())
        }
        Command::Incident {
            product,
            expected,
            observed,
            script_ref,
            log_excerpt,
        } => {
            let mut conn = open_db(&db_path)?;
            let input = IncidentInput {
                product_id: product,
                expected,
                observed,
                script_ref,
                log_excerpt,
            };
            let report = report_incident(&mut conn, &config, &input, "humain:cli")?;
            println!("{}", serde_json::to_string_pretty(&report)?);
            Ok(())
        }
        Command::Check {
            product,
            file,
            kind,
        } => {
            let conn = open_db(&db_path)?;
            let script = std::fs::read_to_string(&file).map_err(KbError::Io)?;
            let input = CheckInput {
                product_id: product,
                identifiers: Vec::new(),
                script_text: Some(script),
                script_kind: Some(kind),
            };
            let response = check(&conn, &config, &input)?;
            println!("{}", serde_json::to_string_pretty(&response)?);
            Ok(())
        }
    }
}

fn run_audit(db_path: &Path, sample: i64) -> KbResult<()> {
    let conn = open_db(db_path)?;
    let entries = audit_sample(&conn, sample)?;
    if entries.is_empty() {
        println!("aucune entree valide a auditer");
        return Ok(());
    }
    let log_path = db_path
        .parent()
        .map(|parent| parent.join("audit_log.jsonl"))
        .unwrap_or_else(|| PathBuf::from("audit_log.jsonl"));
    let mut log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(KbError::Io)?;
    let mut a_corriger = 0i64;
    let mut reviewed = 0i64;
    for entry in &entries {
        println!(
            "\n#{} {} / {} [{}]\nsource: {}\nsymptome: {}\ncorrection: {}\n",
            entry.entry_id,
            entry.product_id,
            entry.subject_key,
            entry.status,
            entry.source,
            entry.symptom.as_deref().unwrap_or("-"),
            entry.correction
        );
        print!("verdict (conforme / a_corriger / vide pour passer): ");
        io::stdout().flush().map_err(KbError::Io)?;
        let mut answer = String::new();
        io::stdin().read_line(&mut answer).map_err(KbError::Io)?;
        let verdict = answer.trim().to_lowercase();
        if verdict != "conforme" && verdict != "a_corriger" {
            continue;
        }
        reviewed += 1;
        if verdict == "a_corriger" {
            a_corriger += 1;
        }
        let record = serde_json::json!({
            "entry_id": entry.entry_id,
            "product_id": entry.product_id,
            "verdict": verdict,
            "audited_at": now_iso()
        });
        writeln!(log, "{}", serde_json::to_string(&record)?).map_err(KbError::Io)?;
    }
    if reviewed > 0 {
        println!(
            "\n{}/{} entree(s) a corriger ({:.1}%)",
            a_corriger,
            reviewed,
            (a_corriger as f64 / reviewed as f64) * 100.0
        );
    }
    Ok(())
}
