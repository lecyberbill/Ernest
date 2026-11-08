use clap::Parser;
use hernest_ide_core::server;

#[derive(Parser, Debug)]
#[command(name = "hernest-ide-core")]
#[command(author = "DeepMind Pair • Hernest Platform")]
#[command(version = "1.0.0")]
#[command(about = "Moteur Agentique & Serveur Dédié Hernest IDE")]
struct Cli {
    #[arg(long, default_value_t = 8090)]
    port: u16,

    #[arg(long, default_value = "127.0.0.1")]
    host: String,
}

fn main() {
    let args = Cli::parse();
    server::start_http_server(&args.host, args.port);
}

