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

6. **Final Result (`kv-wal-engine`)**
   - **Delivered**: Pure-Rust, zero-dependency transactional KV engine (`wal.rs`, `engine.rs`, `mvcc.rs`, `snapshot.rs`) built under strict Mode 3 → Mode 2 governance.
   - **Verified**: `cargo test --all-targets` in `D:\Projet\kv-wal-engine` → **23/23 tests passing** (3 unit + 5 `wal_format` + 5 `crash_recovery` + 4 `mvcc_conflict` + 6 `compaction_restart`) + `cargo clippy --all-targets -- -D warnings` (**0 warnings**).
   - **E2E Functional Stress Test (`tests/e2e_functional.rs`)**:
     - `1,301` durable WAL operations (`1,000` puts + `200` updates + `100` deletes + `1` owned `EngineTransaction`) with `fsync`: **430 ms**.
     - Simulated crash (corrupt tail `0xDEADBEEF...`) + recovery + atomic snapshot compaction (`.tmp` + `rename` + WAL truncated to `0` bytes): **21 ms**.
     - Full restart from snapshot + MVCC `WriteConflict` & `CompactionBusy` guards: **100% verified** (total test runtime: **470 ms**).
   - **Additional Fixes**: Raised `max_steps` to `80` (`react.rs`), dynamic context budget via Ollama `/api/show` & LM Studio `/api/v0/models` (`router.rs`), `.ide/atlas.md` & multi-turn history (`react.rs`), `"cli"` runner alias (`shadow.rs`), dynamic file-tree refresh (`loadTree()`), `localStorage` last-project persistence, date+time and click-outside close on history dropdown (`app.js`).

## 2. Architectural Choice: IDE as "Guardian of the Temple"

- **Principle**: The IDE deterministically enforces SHA-256 lock verification (`verify_invariants_lock`), sandbox isolation, and probe execution on every `write_code` call, returning `INTEGRITY_VIOLATION` immediately if anything is tampered with.
- **Benefit**: The LLM does **not** need to waste tokens re-reading `.ide/invariants.lock`, `audit.log`, or `policy.json` on every turn; it can focus purely on architecture (Mode 3) and implementation (Mode 2).

## 3. UI/UX & Session Persistence Todo
- Persist last active project (`state.currentProjectName` / `state.currentRoot`) and last active run in `localStorage` so Earnest IDE reopens in the exact state it was closed.
- Inject recent conversation history (`prompt` + `final_answer` of the last 5–6 `runs` for the project) into `messages` in `react.rs` so Earnest Copilote keeps multi-turn context without re-reading everything.
- Fix `compact_messages_if_needed(&mut messages, 36_000)` in `react.rs`: `36_000` is too small and compresses recent `read_file` outputs, causing the LLM to re-read the same files in a loop. Raise the threshold (e.g. `120_000`) and preserve the last 6–8 tool outputs untouched.
- Add project-local `.ide/atlas.md` (living architecture/API atlas): not injected into every prompt (keeps prompts light), just mentioned in 1 line so the LLM reads/updates it on demand via `read_file`/`write_file` and it is automatically removed if the project is deleted.

