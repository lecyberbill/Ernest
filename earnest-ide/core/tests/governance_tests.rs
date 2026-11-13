use earnest_ide_core::governance::{
    GovernanceMode, InvariantsFile, PolicyManager,
    invariants::sha256_hex,
};
use serde_json::json;

#[test]
fn invariants_rejects_missing_probe_id() {
    let invalid = json!({
        "project_id": "test-proj",
        "contracts": [{
            "id": "C1",
            "title": "Test",
            "statement": "Must pass",
            "criticality": "critical",
            "target_file": "src/lib.rs",
            "probes": [{
                "runner": "cargo_test",
                "target": "test_a",
                "expected": "pass"
            }]
        }]
    });
    let res: Result<InvariantsFile, _> = serde_json::from_value(invalid);
    assert!(res.is_err(), "Should reject probe without probe_id");
    assert!(res.unwrap_err().to_string().contains("probe_id"));
}

#[test]
fn invariants_rejects_missing_runner() {
    let invalid = json!({
        "project_id": "test-proj",
        "contracts": [{
            "id": "C1",
            "title": "Test",
            "statement": "Must pass",
            "criticality": "critical",
            "target_file": "src/lib.rs",
            "probes": [{
                "probe_id": "C1-P1",
                "target": "test_a",
                "expected": "pass"
            }]
        }]
    });
    let res: Result<InvariantsFile, _> = serde_json::from_value(invalid);
    assert!(res.is_err(), "Should reject probe without runner");
    assert!(res.unwrap_err().to_string().contains("runner"));
}

#[test]
fn invariants_accepts_valid_schema() {
    let valid = json!({
        "schema_version": "1.0.0",
        "project_id": "test-proj",
        "contracts": [{
            "id": "C1",
            "title": "Test",
            "statement": "Must pass",
            "criticality": "critical",
            "target_file": "src/lib.rs",
            "probes": [{
                "probe_id": "C1-P1",
                "runner": "cargo_test",
                "target": "test_a",
                "expected": "pass"
            }]
        }]
    });
    let res: Result<InvariantsFile, _> = serde_json::from_value(valid);
    assert!(res.is_ok(), "Valid InvariantsFile should deserialize: {:?}", res.err());
}

#[test]
fn policy_manager_switches_modes_on_disk() {
    let tmp = std::env::temp_dir().join(format!("earnest_gov_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).unwrap();

    let pm = PolicyManager::new(&tmp);
    let mut policy = pm.load_or_init(Some(GovernanceMode::Architecture)).unwrap();
    policy.mode = GovernanceMode::Architecture;
    pm.save(&policy).unwrap();
    assert_eq!(pm.load_or_init(None).unwrap().mode, GovernanceMode::Architecture);

    // Constrained without invariants.lock must fall back to Architecture (guardrail)
    policy.mode = GovernanceMode::Constrained;
    pm.save(&policy).unwrap();
    assert_eq!(pm.load_or_init(None).unwrap().mode, GovernanceMode::Architecture);

    policy.mode = GovernanceMode::Normal;
    pm.save(&policy).unwrap();
    assert_eq!(pm.load_or_init(None).unwrap().mode, GovernanceMode::Normal);

    let _ = std::fs::remove_dir_all(&tmp);
}

#[test]
fn sha256_hex_is_deterministic() {
    let h1 = sha256_hex(b"earnest-invariants");
    let h2 = sha256_hex(b"earnest-invariants");
    let h3 = sha256_hex(b"other");
    assert_eq!(h1.len(), 64);
    assert_eq!(h1, h2);
    assert_ne!(h1, h3);
}
