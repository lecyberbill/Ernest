use std::collections::HashSet;
use regex::Regex;
use serde_json::Value;

pub fn extract_local_code_symbols(code: &str, lang: &str) -> Vec<Value> {
    let mut words = HashSet::new();
    let ident_re = Regex::new(r"\b[A-Za-z_][A-Za-z0-9_]{2,}\b").unwrap();

    for cap in ident_re.find_iter(code) {
        words.insert(cap.as_str().to_string());
    }

    // Mots-clés standards selon le langage pour enrichir le type
    let mut items = Vec::new();
    for word in words {
        let kind = match lang {
            "rust" => {
                if ["fn", "let", "mut", "pub", "impl", "struct", "enum", "trait", "match", "use", "mod", "crate"].contains(&word.as_str()) {
                    "keyword"
                } else if word.chars().next().map(|c| c.is_uppercase()).unwrap_or(false) {
                    "type"
                } else {
                    "variable"
                }
            },
            "python" => {
                if ["def", "class", "import", "from", "return", "if", "elif", "else", "for", "while", "with", "as", "try", "except"].contains(&word.as_str()) {
                    "keyword"
                } else if word.chars().next().map(|c| c.is_uppercase()).unwrap_or(false) {
                    "class"
                } else {
                    "variable"
                }
            },
            "typescript" | "javascript" => {
                if ["const", "let", "var", "function", "class", "interface", "type", "import", "export", "return", "async", "await"].contains(&word.as_str()) {
                    "keyword"
                } else if word.chars().next().map(|c| c.is_uppercase()).unwrap_or(false) {
                    "type"
                } else {
                    "variable"
                }
            },
            _ => "text",
        };

        items.push(serde_json::json!({
            "label": word,
            "kind": kind,
            "detail": format!("{} ({})", word, lang),
            "doc": ""
        }));
    }

    items
}

