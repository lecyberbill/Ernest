use reqwest::blocking::Client;
use serde_json::Value;
use std::time::Duration;
use regex::Regex;

pub fn search_web(query: &str, max_results: usize) -> Result<Value, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Erreur initialisation client HTTP: {}", e))?;

    // On utilise l'endpoint lite.duckduckgo.com/lite/ ultra stable et sans Javascript/Cloudflare
    let form_params = [("q", query)];
    let resp = client.post("https://lite.duckduckgo.com/lite/")
        .form(&form_params)
        .header("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.8")
        .send()
        .map_err(|e| format!("Erreur recherche DuckDuckGo: {}", e))?;

    let html = resp.text().map_err(|e| format!("Erreur lecture réponse: {}", e))?;

    let re_links = Regex::new(r#"(?s)<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>(.*?)</a>"#).unwrap();
    let re_snippets = Regex::new(r#"(?s)<td[^>]*class="result-snippet"[^>]*>(.*?)</td>"#).unwrap();
    let re_tags = Regex::new(r"<[^>]+>").unwrap();

    let titles: Vec<(String, String)> = re_links
        .captures_iter(&html)
        .map(|c| {
            let mut link = c[1].to_string();
            if let Some(pos) = link.find("uddg=") {
                let encoded = &link[pos + 5..];
                let clean = encoded.split('&').next().unwrap_or(encoded);
                if let Ok(decoded) = urlencoding::decode(clean) {
                    link = decoded.into_owned();
                }
            }
            let text = re_tags.replace_all(&c[2], "").trim().to_string();
            (link, text)
        })
        .collect();

    let snippets: Vec<String> = re_snippets
        .captures_iter(&html)
        .map(|c| re_tags.replace_all(&c[1], "").trim().to_string())
        .collect();

    let mut results = Vec::new();
    let limit = titles.len().min(max_results);

    for i in 0..limit {
        let snippet = if i < snippets.len() { snippets[i].clone() } else { String::new() };
        results.push(serde_json::json!({
            "title": if titles[i].1.is_empty() { format!("Résultat {}", i + 1) } else { titles[i].1.clone() },
            "url": titles[i].0,
            "snippet": snippet
        }));
    }

    Ok(serde_json::json!({
        "status": "success",
        "query": query,
        "count": results.len(),
        "results": results
    }))
}

pub fn fetch_web_page(url: &str, max_chars: usize) -> Result<Value, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Seules les URLs HTTP/HTTPS sont autorisées.".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Erreur initialisation client HTTP: {}", e))?;

    let resp = client.get(url).send().map_err(|e| format!("Erreur téléchargement page: {}", e))?;
    let status = resp.status().as_u16();
    let text = resp.text().map_err(|e| format!("Erreur lecture contenu: {}", e))?;

    // Nettoyage rapide des balises HTML
    let re_scripts = Regex::new(r"(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>").unwrap();
    let no_scripts = re_scripts.replace_all(&text, " ");
    let re_tags = Regex::new(r"<[^>]+>").unwrap();
    let clean_text = re_tags.replace_all(&no_scripts, " ").split_whitespace().collect::<Vec<_>>().join(" ");

    let truncated = clean_text.len() > max_chars;
    let final_content = if truncated {
        format!("{}... [Tronqué à {} caractères]", &clean_text[..max_chars], max_chars)
    } else {
        clean_text
    };

    Ok(serde_json::json!({
        "status_code": status,
        "truncated": truncated,
        "content": final_content
    }))
}
