use crate::config::AppConfig;

pub fn redact_text(config: &AppConfig, value: &str) -> String {
    let mut output = value.to_string();
    for rule in &config.redaction {
        output = rule
            .regex
            .replace_all(&output, rule.replacement.as_str())
            .into_owned();
    }
    output
}

pub fn redact_opt(config: &AppConfig, value: &Option<String>) -> Option<String> {
    value.as_ref().map(|text| redact_text(config, text))
}
