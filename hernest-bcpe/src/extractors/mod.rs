use crate::config::AppConfig;
use crate::error::{KbError, KbResult};
use crate::models::Occurrence;

#[derive(Debug, Clone)]
pub struct ExtractedIdentifier {
    pub identifier: String,
    pub occurrence: Occurrence,
}

fn blank_comments_and_strings(input: &str) -> String {
    let mut bytes = input.as_bytes().to_vec();
    let len = bytes.len();
    let mut i = 0usize;
    while i < len {
        match bytes[i] {
            b'/' if i + 1 < len && bytes[i + 1] == b'/' => {
                bytes[i] = b' ';
                bytes[i + 1] = b' ';
                i += 2;
                while i < len && bytes[i] != b'\n' {
                    bytes[i] = b' ';
                    i += 1;
                }
            }
            b'/' if i + 1 < len && bytes[i + 1] == b'*' => {
                bytes[i] = b' ';
                bytes[i + 1] = b' ';
                i += 2;
                while i < len {
                    if bytes[i] == b'*' && i + 1 < len && bytes[i + 1] == b'/' {
                        bytes[i] = b' ';
                        bytes[i + 1] = b' ';
                        i += 2;
                        break;
                    }
                    if bytes[i] != b'\n' {
                        bytes[i] = b' ';
                    }
                    i += 1;
                }
            }
            b'<' if i + 3 < len
                && bytes[i + 1] == b'!'
                && bytes[i + 2] == b'-'
                && bytes[i + 3] == b'-' =>
            {
                for slot in bytes.iter_mut().skip(i).take(4) {
                    *slot = b' ';
                }
                i += 4;
                while i < len {
                    if bytes[i] == b'-'
                        && i + 2 < len
                        && bytes[i + 1] == b'-'
                        && bytes[i + 2] == b'>'
                    {
                        bytes[i] = b' ';
                        bytes[i + 1] = b' ';
                        bytes[i + 2] = b' ';
                        i += 3;
                        break;
                    }
                    if bytes[i] != b'\n' {
                        bytes[i] = b' ';
                    }
                    i += 1;
                }
            }
            quote @ (b'"' | b'\'') => {
                bytes[i] = b' ';
                i += 1;
                while i < len {
                    let current = bytes[i];
                    if current == b'\\' {
                        bytes[i] = b' ';
                        if i + 1 < len {
                            if bytes[i + 1] != b'\n' {
                                bytes[i + 1] = b' ';
                            }
                            i += 2;
                        } else {
                            i += 1;
                        }
                        continue;
                    }
                    if current == quote {
                        bytes[i] = b' ';
                        i += 1;
                        break;
                    }
                    if current != b'\n' {
                        bytes[i] = b' ';
                    }
                    i += 1;
                }
            }
            _ => i += 1,
        }
    }
    String::from_utf8(bytes).unwrap_or_else(|_| input.to_string())
}

fn line_and_column(input: &str, offset: usize) -> (usize, usize) {
    let bytes = input.as_bytes();
    let limit = offset.min(bytes.len());
    let mut line = 1usize;
    let mut last_newline = None;
    for (index, byte) in bytes.iter().enumerate().take(limit) {
        if *byte == b'\n' {
            line += 1;
            last_newline = Some(index);
        }
    }
    let line_start = last_newline.map(|value| value + 1).unwrap_or(0);
    (line, limit.saturating_sub(line_start) + 1)
}

fn line_context(input: &str, offset: usize) -> String {
    let bytes = input.as_bytes();
    let limit = offset.min(bytes.len());
    let start = bytes[..limit]
        .iter()
        .rposition(|byte| *byte == b'\n')
        .map(|value| value + 1)
        .unwrap_or(0);
    let end = bytes[limit..]
        .iter()
        .position(|byte| *byte == b'\n')
        .map(|value| limit + value)
        .unwrap_or(bytes.len());
    let text = String::from_utf8_lossy(&bytes[start..end]);
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() > 200 {
        flat.chars().take(200).collect()
    } else {
        flat
    }
}

pub fn extract(config: &AppConfig, kind: &str, script: &str) -> KbResult<Vec<ExtractedIdentifier>> {
    let extractor = config.extractor(kind).ok_or_else(|| {
        let available: Vec<String> = config.extractors.keys().cloned().collect();
        KbError::invalid(format!(
            "script_kind '{kind}' inconnu; extracteurs disponibles: {}",
            available.join(", ")
        ))
    })?;
    let blanked = blank_comments_and_strings(script);
    let mut output = Vec::new();
    for pattern in &extractor.patterns {
        for captures in pattern.regex.captures_iter(&blanked) {
            let Some(found) = captures.get(pattern.group) else {
                continue;
            };
            let identifier = found.as_str().trim();
            if identifier.is_empty() {
                continue;
            }
            let (line, column) = line_and_column(&blanked, found.start());
            output.push(ExtractedIdentifier {
                identifier: identifier.to_string(),
                occurrence: Occurrence {
                    line,
                    column,
                    context: line_context(script, found.start()),
                },
            });
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blanks_comments_and_strings_but_keeps_length() {
        let sample = "TAG_ATTENTE = \"TAG_FAUX\" // TAG_COMMENT\n/* TAG_BLOCK */";
        let blanked = blank_comments_and_strings(sample);
        assert_eq!(blanked.len(), sample.len());
        assert!(blanked.contains("TAG_ATTENTE"));
        assert!(!blanked.contains("TAG_FAUX"));
        assert!(!blanked.contains("TAG_COMMENT"));
        assert!(!blanked.contains("TAG_BLOCK"));
    }
}
