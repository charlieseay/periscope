<p align="center">
  <img src="assets/icons/icon.png" width="80" alt="Periscope" />
</p>

<h1 align="center">Periscope</h1>

<p align="center">
  Internal VS Code coding agent that routes through Helmsman — preserves Claude Max quota by defaulting to NVIDIA / Nova / Gemini lanes for everyday work.
</p>

---

## What this is

Periscope is an **internal-only** VS Code extension. It is a fork of [Cline](https://github.com/cline/cline) (Apache-2.0) with the provider layer rewritten so day-to-day VS Code work routes through Helmsman instead of burning Anthropic API or Claude Max subscription quota on tasks that don't need Opus.

Not on the marketplace. Not telemetered. Installed via local `.vsix`.

## Why

- Claude Max quota is finite. Most VS Code work (reads, summaries, scaffolding, terse code) doesn't need Opus.
- The official Claude Code extension is closed and Anthropic-only.
- Cline already has a mature provider abstraction, chat UI, file diffs, MCP support, and terminal integration. Forking it is one adapter file per provider, not a from-scratch build.
- Routing through Helmsman gives the same NVIDIA-first / cloud-on-escalation behavior we already use everywhere else.

## Providers

| Provider | What it routes to | When to use |
|---|---|---|
| `ask-helmsman` (default) | `ask_helmsman` CLI → auto-classifies and dispatches to NVIDIA / ask_claude / ask_gemini / ask_nova | Default for everything — Helmsman picks the cheapest competent lane per request |
| `ask-nvidia` | `ask_nvidia --lane <fast\|balanced\|large\|code\|thinking>` | Direct NVIDIA control when you know the lane you want |
| `ask-claude` | `ask_claude` CLI (Claude Max subscription) | Quality writing, hard reasoning, last-resort fallback |
| `ask-gemini` | `ask_gemini` CLI (Google One subscription) | Web research with grounding, large-context tasks |
| `ask-nova` | `ask_claude_bedrock` CLI (AWS Bedrock Anthropic) | Metered Claude when Claude Max is exhausted |
| `bedrock`, `ollama`, etc. | Upstream Cline providers (kept) | Direct API access when needed |

Each non-Bedrock provider is wrapped in a `FallbackApiHandler` that auto-falls-back to Helmsman on quota / spend-cap / invalid-model errors. Bedrock falls back to Helmsman too. Helmsman itself falls back to `ask_claude` if the ai-proxy is down.

## Configuration

Settings appear in `Cmd+,` under "Periscope":

- `periscope.defaultProvider` — provider used when starting a new task and no global state is set yet. Works per-workspace via `.vscode/settings.json`.
- `periscope.helmsman.defaultRoute` — `auto` / `web` / `writing` / `code`. Default `auto` (Helmsman classifies).
- `periscope.nvidia.defaultLane` — `fast` / `balanced` / `large` / `code` / `thinking`. Default `balanced`.
- `periscope.logLevel` — `debug` / `info` / `warn` / `error`.

## Building locally

```bash
cd ~/Projects/periscope
npm install
npm run package      # build dist/
npx vsce package     # produce .vsix
code --install-extension periscope-X.X.X.vsix
```

## Architecture

```
VS Code (Periscope panel)
  └── Cline core (preserved: chat, diff, MCP, terminal)
        └── Provider layer (Periscope-specific)
              ├── ask-helmsman.ts → ~/.local/bin/ask_helmsman
              ├── ask-nvidia.ts   → ~/.local/bin/ask_nvidia --lane <X>
              ├── ask-claude.ts   → ~/.local/bin/ask_claude
              ├── ask-gemini.ts   → ~/.local/bin/ask_gemini
              ├── ask-nova.ts     → ~/.local/bin/ask_claude_bedrock --lane <X>
              ├── fallback.ts     → wraps any handler with auto-degrade to a secondary
              └── (upstream)      → bedrock, openai, ollama, etc. preserved
```

Vault project notes:
- `Projects/Periscope/Periscope.md` — full spec
- `Projects/Periscope/Audit 2026-05-28.md` — latest audit + bug/feature status
- `Projects/Periscope/Tech Spec.md` — architecture
- `Projects/Periscope/Bugs/`, `Projects/Periscope/Features/` — backlog

## Attribution

Forked from [Cline](https://github.com/cline/cline) — Apache-2.0. The upstream LICENSE and NOTICE files are preserved verbatim per the license terms.

## License

Apache 2.0 © 2026 Seaynic Labs LLC. Includes Apache-2.0 © 2026 Cline Bot Inc. (upstream).
