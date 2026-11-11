fn main() {
    if let Err(err) = kb::cli::run() {
        eprintln!("kb: {err}");
        std::process::exit(1);
    }
}
