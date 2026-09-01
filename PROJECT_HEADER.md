# Periscope

**Type:** tool  
**Status:** active  
**Owner:** SeaynicNet Platform Team  
**Created:** 2025-08-15  
**Last Updated:** 2026-09-01

## Purpose
Internal VS Code coding agent (fork of Cline). Routes through Helmsman to preserve Claude Max quota by defaulting to NVIDIA/Nova/Gemini for everyday work. Not on marketplace, installed via local .vsix.

## Current State
**Status:** Active development, 865 commits in last 3 months  
**Installation:** Local .vsix only (not published)  
**Providers:** ask-helmsman (default), ask-nvidia, ask-claude, ask-gemini, ask-nova, bedrock, ollama

---

## Last Decisions

| Date | Decision | Rationale | Impact |
|------|----------|-----------|--------|
| 2025-08-15 | Fork Cline instead of building from scratch | Mature provider abstraction + UI already built | One adapter file per provider |
| 2025-08-15 | Route through Helmsman by default | NVIDIA-first preserves Claude Max quota | Same behavior as rest of platform |
| 2025-08-15 | Internal-only, no marketplace | No telemetry, full control | Not public, .vsix install only |

---

## Resource Inventory

### Services Provided
None (desktop tool, not a service)

### Services Consumed

| Service | URL | Auth Method | Credentials Location | Notes |
|---------|-----|-------------|---------------------|-------|
| ask_helmsman CLI | ~/.local/bin/ask_helmsman | None (local) | — | Default provider |
| ask_nvidia CLI | ~/.local/bin/ask_nvidia | API key | /Volumes/data/secrets/nvidia_api_key | NVIDIA NIM lanes |
| ask_claude CLI | ~/.local/bin/ask_claude | Claude Max subscription | — | Quality writing |
| ask_gemini CLI | ~/.local/bin/ask_gemini | Google One | — | Web research |

### External Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x | Build + extension runtime |
| VS Code | latest | Host application |
| Cline (fork) | Apache-2.0 | Base codebase |

---

## Build & Deploy

### Local Development
```bash
cd ~/Projects/periscope
npm install
npm run dev  # watch mode
code --extensionDevelopmentPath=.
```

### Package
```bash
npm run package      # build dist/
npx vsce package     # produce .vsix
code --install-extension periscope-*.vsix
```

---

## Assessment — 2026-09-01

### Errors & Risks
[CRIT] 28 npm vulnerabilities: 1 critical (extract-zip symlink traversal), 20 high (brace-expansion DoS ×6, sharp/libvips CVE-2026-33327/33328/35590/35591), 4 moderate, 3 low. `npm audit fix` available; `--force` breaks ink-picture dependency.
[HIGH] 134+ TODO/FIXME items in codebase (last assessment). No current triage visible. Blocks maintenance.
[HIGH] Model picker UX flakiness reported in prior assessment — fallback logic missing.
[MED] No test coverage target or CI-enforced coverage gates. Test suite exists but baseline unknown.

### Security
[FAIL] 28 unpatched CVEs in transitive dependencies (brace-expansion chain affects 10+ packages). Symlink traversal in extract-zip allows directory escape. Missing: input validation on LLM responses before UI rendering. MCP tool execution sandboxing not reviewed. No rate limiting on Ollama (could exhaust system).
[MED] Hardcoded Claude preference in some code paths despite Helmsman-first routing design.

### Improvements
1. Run `npm audit fix` to address low/moderate vulns (most) and high vulns in brace-expansion chain (9 packages)
2. For critical extract-zip symlink traversal (GHSA-jmr9-qjv8-65gv) — update to patched version or replace with alternative
3. Investigate sharp/libvips CVEs (4 new CVEs in 2026) — confirm impact on Periscope's image pipeline
4. Triage 134+ TODOs into P0/P1/P2; move to issues if not actionable
5. Establish test coverage baseline (e.g., >70% for UI-critical paths); add to CI gates
6. Implement model picker fallback + Helmsman routing policy verification

### Cost
Routes through Helmsman (NVIDIA-first) by design. Verify hardcoded Claude calls respect quota preservation.

### Performance
No obvious bottlenecks. MCP proxy latency not measured. Local Ollama can block UI; needs async pattern.

### Verdict
**D+** — Feature-rich but operationally unsafe. 28 npm vulnerabilities (1 critical, 20 high) are blocking for production. Extract-zip critical symlink traversal must be fixed immediately. TODO sprawl and missing test coverage require triage before any release.

---

## Related Documentation
- **README:** `~/Projects/periscope/README.md`
- **Changelog:** `~/Projects/periscope/CHANGELOG.md`
- **Source:** Fork of https://github.com/cline/cline
