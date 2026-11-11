pub fn is_valid_version(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let mut segments = 0usize;
    for segment in value.split('.') {
        if segment.is_empty() || !segment.bytes().all(|b| b.is_ascii_digit()) {
            return false;
        }
        segments += 1;
    }
    segments > 0
}

fn normalize(value: &str) -> Vec<String> {
    let mut parts: Vec<String> = value
        .split('.')
        .map(|segment| {
            let trimmed = segment.trim_start_matches('0');
            if trimmed.is_empty() {
                "0".to_string()
            } else {
                trimmed.to_string()
            }
        })
        .collect();
    while parts.len() > 1 && parts.last().map(|s| s == "0").unwrap_or(false) {
        parts.pop();
    }
    parts
}

pub fn versions_equal(left: &str, right: &str) -> bool {
    if !is_valid_version(left) || !is_valid_version(right) {
        return false;
    }
    normalize(left) == normalize(right)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_numeric_versions() {
        assert!(is_valid_version("2.0"));
        assert!(is_valid_version("1.10"));
        assert!(is_valid_version("2026.11"));
        assert!(!is_valid_version("2.x"));
        assert!(!is_valid_version("2."));
        assert!(!is_valid_version(""));
    }

    #[test]
    fn compares_with_trailing_zero_segments() {
        assert!(versions_equal("2.0", "2.0.0"));
        assert!(versions_equal("2.0", "2"));
        assert!(!versions_equal("2.0", "2.0.1"));
        assert!(!versions_equal("1.10", "1.1"));
    }
}
