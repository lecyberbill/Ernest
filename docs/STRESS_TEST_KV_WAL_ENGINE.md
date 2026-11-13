# Stress-Test & Architectural Findings (`kv-wal-engine` / Earnest IDE)

## 1. Key Findings & Fixes Applied

1. **Silent ReAct Loop Exit (`max_steps = 12`)**
   - **Symptom**: The agent stopped mid-run with no UI answer and no terminal indicator.
   - **Fix** (`earnest-ide/core/src/engine/react.rs`): Raised `max_steps` from `12` to `30`, added an explicit `answer` trace when `max_steps` is reached, and added terminal status logs (`✅`, `⚠️`, `⏸️`, `🤖 [LLM] Backend actif`).

2. **Relative Path Resolution in `list_files` / `grep_search`**
   - **Symptom**: Calling `list_files(".")` resolved against the server's CWD (`earnest-ide/src-tauri`) instead of `workspace_root` (`D:\Projet\kv-wal-engine`), causing the agent to see phantom files.
   - **Fix** (`earnest-ide/core/src/engine/react.rs`): Resolved relative `root_path` arguments against `self.workspace_root`.

3. **Unsupported Probe Runner Aliases (`cargo_test` / `static`)**
   - **Symptom**: Probes with `runner: "cargo_test"` or `"static"` failed at `duration_ms = 0` (`Runner de sonde non supporté`).
   - **Fix** (`earnest-ide/core/src/governance/shadow.rs`): Aliased `"static" | "ast_grep"` to `"static_ast"` and `"cargo_test"` to `"cli_exec"`.

4. **Greenfield Deadlock in `write_code` (Single-File + Reset Sandbox)**
   - **Symptom**: `shadow_worktree` is reset on every `write_code`, so writing `Cargo.toml` and `src/wal.rs` in separate calls made it impossible for `cargo test` to pass on a new project.
   - **Fix** (`earnest-ide/core/src/governance/shadow.rs`, `react.rs`): Added atomic multi-file `write_code` support via `files: [{ target_file, patch }]` (`execute_contract_patches`), and added a language-agnostic hint in Mode 2.

5. **BCPE (`kb.exe`) Relative Path Lookup**
   - **Symptom**: `kb_search` / `kb_propose` failed with `os error 3` when launched from `earnest-ide/src-tauri`.
   - **Fix** (`earnest-ide/core/src/engine/react.rs`): Resolved `kb.exe` across `earnest-bcpe\target\release\kb.exe`, `..\...`, `..\..\...`, and `D:\Projet\Hernest\earnest-bcpe\target\release\kb.exe`.

## 2. Architectural Choice: IDE as "Guardian of the Temple"

- **Principle**: The IDE deterministically enforces SHA-256 lock verification (`verify_invariants_lock`), sandbox isolation, and probe execution on every `write_code` call, returning `INTEGRITY_VIOLATION` immediately if anything is tampered with.
- **Benefit**: The LLM does **not** need to waste tokens re-reading `.ide/invariants.lock`, `audit.log`, or `policy.json` on every turn; it can focus purely on architecture (Mode 3) and implementation (Mode 2).

