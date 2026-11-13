# Ernest IDE Stress-Test — `transrust` (`aurora-rust-engine`) Takeover & Flux 3 Support

**Date:** 2026-11-13  
**Target:** `D:\image_to_text\TransRust` (adding `unsloth/flux-3-image-klein-base-FP8` support with zero regression on Flux 1 / Flux 2)

---

## 1. Guardrail Strength Observed in Real Conditions

1. **Zero Architecture Hallucination:**
   - When `web_search` returned no verifiable results for `unsloth/flux-3-image-klein-base-FP8`, the agent **refused to invent** internal dimensions (`num_layers`, `axes_dims_rope`, text encoder variant) and instead formulated architecture-agnostic behavioral invariants gated on explicit verification (`config.json` + `safetensors` header).
2. **Disk-Backed Governance Integrity:**
   - When the user stated in chat "You are in Mode 2", the agent **verified `.ide/policy.json` and `.ide/invariants.lock` on disk**, observed that the project was still in `mode: architecture` without a cryptographic lock, and **refused to write a single line of code**.
3. **Accurate Collision Detection:**
   - Identified the exact routing collision risk in `detect_architecture` (`src/models/config/mod.rs`), where `max_single` thresholds would misclassify Flux 3 as Flux 1/2, as well as the documentation contradiction around `fp8_weights`.

---

## 2. Issues & Improvements Identified

| # | Component | Finding | Status |
|---|-----------|---------|--------|
| 1 | **UI / Backend (`review_approve` & `submit_invariants`)** | `app.js` silently ignored `d.error`; `submit_invariants` did not validate `InvariantsFile` before writing. | **Fixed** (`app.js`, `react.rs` with `expected_schema`) |
| 2 | **BCPE (`earnest-bcpe`)** | `kb.exe` missing (`os error 3`), blocking `kb_search` / `kb_propose`. | **Fixed** (release binary built) |
| 3 | **UI — Mode Switching & Chat UX** | Clicking mode badge showed raw `alert()`; chat bubbles too narrow; no live progress indicator. | **Fixed** (`set_mode` modal, `96%` width, live heartbeat timer) |
| 4 | **Backend — Unit Tests** | `earnest-ide/core` had 0 unit tests. | **Fixed** (`tests/governance_tests.rs`, 5/5 passing) |
| 5 | **Backend — Session Persistence** | Conversation/session state lost after a timeout or interruption on a long turn. | Todo |
| 6 | **Tools (`list_files` / `read_file`)** | `list_files` truncated at 30 entries and path inconsistencies (`src/main.rs`, `tauri.conf.json`). | Todo |
| 7 | **UI — Chat Panel & i18n** | Separate thoughts/tools/final response, interactive checkboxes for choices, i18n (`fr`/`en`). | Todo |
