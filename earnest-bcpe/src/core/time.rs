use chrono::{DateTime, Duration, SecondsFormat, Utc};

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

pub fn days_ago_iso(days: i64) -> String {
    let moment: DateTime<Utc> = Utc::now() - Duration::days(days);
    moment.to_rfc3339_opts(SecondsFormat::Secs, true)
}
