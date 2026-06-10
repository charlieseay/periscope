# Periscope

**Type:** tool  
**Status:** active  
**Owner:** SeaynicNet Platform Team  
**Created:** 2025-08-15  
**Last Updated:** 2026-06-10

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

## Assessment — 2026-06-10

### Errors & Risks
[CRIT] 6 high-severity npm vulnerabilities in OpenTelemetry + xmldom: XML injection (GHSA-wh4c-j3r5-mjhp), DoS via recursion (GHSA-2v35-w6hq-6mfw), middleware bypass (GHSA-92pp-h63x-v22m). [HIGH] 134 TODO/FIXME items in codebase — unsustainable; triage into priority buckets. [HIGH] No test coverage reported; "test" script exists but status unknown. [MED] Model picker UX flakiness reported (task #1001002, #1001005) — needs fallback logic.

### Security
[FAIL] Dependency chain has 6 unpatched CVEs; `npm audit fix` available for all. Missing: input validation on LLM responses before rendering in UI. MCP tool execution needs sandboxing review. No rate limiting on local Ollama calls (could exhaust system resources).

### Improvements
1. Run `npm audit fix` immediately (blocking for production use)
2. Triage 134 TODOs into P0/P1/P2; mark tech debt for next sprint
3. Add test coverage target (aim for >70% for UI-critical paths)
4. Implement model picker fallback + state refresh logic

### Cost
[MED] Routes through Helmsman (NVIDIA-first) by design, but hardcoded Claude preference in some code paths. Verify all providers respect routing policy.

### Performance
[MED] No obvious bottlenecks, but MCP proxy latency not measured. Local Ollama can block UI; needs async/worker pattern.

### Verdict
**C+** — Feature-rich but operationally risky; high CVE burden + TODO sprawl require cleanup before production push. Model picker flakiness needs immediate fix.

---

## Related Documentation
- **README:** `~/Projects/periscope/README.md`
- **Changelog:** `~/Projects/periscope/CHANGELOG.md`
- **Source:** Fork of https://github.com/cline/cline
