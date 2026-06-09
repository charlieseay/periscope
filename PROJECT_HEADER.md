# Periscope

**Type:** tool  
**Status:** active  
**Owner:** SeaynicNet Platform Team  
**Created:** 2025-08-15  
**Last Updated:** 2026-06-09

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

## Related Documentation
- **README:** `~/Projects/periscope/README.md`
- **Changelog:** `~/Projects/periscope/CHANGELOG.md`
- **Source:** Fork of https://github.com/cline/cline
