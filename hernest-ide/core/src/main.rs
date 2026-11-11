use clap::Parser;
use hernest_ide_core::server;
use hernest_ide_core::mcp::McpServer;

#[derive(Parser, Debug)]
#[command(name = "hernest-ide-core")]
#[command(author = "DeepMind Pair • Hernest Platform")]
#[command(version = "1.0.0")]
#[command(about = "Moteur Agentique, Serveur HTTP & Serveur MCP Universel Hernest IDE")]
struct Cli {
    /// Port du serveur HTTP Web IDE
    #[arg(long, default_value_t = 8090)]
    port: u16,

    /// Hôte d'écoute du serveur HTTP
    #[arg(long, default_value = "127.0.0.1")]
    host: String,

    /// Démarre en tant que serveur MCP (Model Context Protocol) sur standard input/output
    #[arg(long)]
    mcp: bool,

    /// Répertoire racine de travail du workspace (défaut: '.')
    #[arg(long, default_value = ".")]
    workspace: String,
}

fn main() {
    let args = Cli::parse();

    if args.mcp {
        // Mode Serveur MCP (stdio)
        let mut server = McpServer::new(&args.workspace);
        if let Err(e) = server.run_stdio() {
            eprintln!("Erreur exécution serveur MCP Hernest IDE: {}", e);
            std::process::exit(1);
        }
    } else {
        // Mode Serveur HTTP & IDE Web
        server::start_http_server(&args.host, args.port);
    }
}
