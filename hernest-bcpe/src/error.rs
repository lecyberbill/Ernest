use std::fmt;

#[derive(Debug)]
pub enum KbError {
    InvalidArgument(String),
    NotFound(String),
    VersionConflict(String),
    ForbiddenStatus(String),
    UnknownProduct(String),
    RateLimited(String),
    Db(rusqlite::Error),
    Io(std::io::Error),
    Json(serde_json::Error),
    Config(String),
    Internal(String),
}

pub type KbResult<T> = Result<T, KbError>;

impl KbError {
    pub fn code(&self) -> &'static str {
        match self {
            KbError::InvalidArgument(_) => "invalid_argument",
            KbError::NotFound(_) => "not_found",
            KbError::VersionConflict(_) => "version_conflict",
            KbError::ForbiddenStatus(_) => "forbidden_status",
            KbError::UnknownProduct(_) => "unknown_product",
            KbError::RateLimited(_) => "rate_limited",
            KbError::Db(_) => "internal_error",
            KbError::Io(_) => "internal_error",
            KbError::Json(_) => "internal_error",
            KbError::Config(_) => "internal_error",
            KbError::Internal(_) => "internal_error",
        }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        KbError::InvalidArgument(message.into())
    }
}

impl fmt::Display for KbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            KbError::InvalidArgument(m) => write!(f, "argument invalide: {m}"),
            KbError::NotFound(m) => write!(f, "introuvable: {m}"),
            KbError::VersionConflict(m) => write!(f, "conflit de version: {m}"),
            KbError::ForbiddenStatus(m) => write!(f, "statut interdit: {m}"),
            KbError::UnknownProduct(m) => write!(f, "produit inconnu: {m}"),
            KbError::RateLimited(m) => write!(f, "limite d'écriture atteinte: {m}"),
            KbError::Db(e) => write!(f, "erreur base de données: {e}"),
            KbError::Io(e) => write!(f, "erreur d'entrée/sortie: {e}"),
            KbError::Json(e) => write!(f, "erreur JSON: {e}"),
            KbError::Config(m) => write!(f, "erreur de configuration: {m}"),
            KbError::Internal(m) => write!(f, "erreur interne: {m}"),
        }
    }
}

impl std::error::Error for KbError {}

impl From<rusqlite::Error> for KbError {
    fn from(e: rusqlite::Error) -> Self {
        KbError::Db(e)
    }
}

impl From<std::io::Error> for KbError {
    fn from(e: std::io::Error) -> Self {
        KbError::Io(e)
    }
}

impl From<serde_json::Error> for KbError {
    fn from(e: serde_json::Error) -> Self {
        KbError::Json(e)
    }
}
