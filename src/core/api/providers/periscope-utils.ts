import fs from "node:fs/promises"
import path from "node:path"
import { ClineStorageMessage } from "@/shared/messages/content"

export const PERISCOPE_SYSTEM_PROMPT = `You are Periscope, a helpful AI coding assistant. Answer questions clearly and concisely. When asked to help with code, provide the solution directly. Do not use XML tool tags or attempt to run commands unless explicitly shown how in this conversation.`

// ─── Shared infrastructure: secret fetch, CLI preflight, timeouts ──────────
// Lifted from individual adapters during audit Round 2 (2026-05-28) so the
// TCC bypass, missing-binary detection, and timeout policy stay consistent.

/** Uniform request timeout across all CLI providers. Was inconsistent: nvidia=∞,
 *  claude=∞, gemini=120s, nova=120s, helmsman=180s. Now everyone gets 180s
 *  unless they explicitly override (e.g. helmsman vision proxy has its own 30s). */
export const PERISCOPE_REQUEST_TIMEOUT_MS = 180_000

const CREDENTIAL_MANAGER_URL = "http://localhost:5903"
const DISPATCH_SECRET_PATH = `${process.env.HOME}/.local/lib/secrets/dispatch_webhook_secret`
const SECRETS_DIR = "/Volumes/data/secrets"

/**
 * Fetch a secret in the TCC-safe way: credential-manager first (a Docker
 * container with file access that bypasses macOS sandbox restrictions on
 * `/Volumes/data`), then fall back to direct file read if the container is
 * unreachable. Mirrors the pattern adopted by helmsman-self-heal-watcher.
 *
 * @param name Service name (e.g. "n8n_api_key", "nvidia_api_key"). The
 *             credential-manager tries `{name}_api_token`, `{name}_token`,
 *             `{name}_key`, and `{name}` against `/secrets/`.
 */
export async function getPeriscopeSecret(name: string): Promise<string> {
	// Try credential-manager first (TCC-safe path).
	try {
		const dispatchSecret = (await fs.readFile(DISPATCH_SECRET_PATH, "utf8")).trim()
		const res = await fetch(`${CREDENTIAL_MANAGER_URL}/credentials/${encodeURIComponent(name)}`, {
			headers: { "X-Dispatch-Secret": dispatchSecret },
			signal: AbortSignal.timeout(5000),
		})
		if (res.ok) {
			const body = (await res.json()) as { token?: string }
			if (body.token) return body.token
		}
	} catch {
		// credential-manager unreachable or dispatch secret missing — fall through.
	}

	// Fall back to direct file read. Tries the same patterns credential-manager does.
	const candidates = [`${name}_api_token`, `${name}_token`, `${name}_key`, name]
	for (const fname of candidates) {
		try {
			const raw = await fs.readFile(path.join(SECRETS_DIR, fname), "utf8")
			return raw.trim()
		} catch {
			// next candidate
		}
	}
	throw new Error(
		`[periscope-utils] Cannot read secret "${name}" via credential-manager (${CREDENTIAL_MANAGER_URL}) or filesystem (${SECRETS_DIR}). Verify (1) credential-manager container is running, (2) /Volumes/data/secrets has the file, OR (3) the dispatch secret at ${DISPATCH_SECRET_PATH} is set.`,
	)
}

/**
 * Verify a periscope CLI is installed and executable. Caches the check so
 * subsequent calls are free. Throws a structured error with installation
 * hint instead of letting execa surface a cryptic ENOENT.
 *
 * @param binPath Absolute path to the CLI (e.g. ~/.local/bin/ask_helmsman)
 * @param name Display name for the error message
 */
const _cliCheckCache = new Map<string, true>()
export async function requirePeriscopeCli(binPath: string, name: string): Promise<void> {
	if (_cliCheckCache.has(binPath)) return
	try {
		const st = await fs.stat(binPath)
		if (!st.isFile() && !st.isSymbolicLink()) {
			throw new Error(`exists but is not a file or symlink`)
		}
		// Check execute bit. On macOS, mode & 0o111 must be non-zero for at least
		// one of user/group/other.
		if ((st.mode & 0o111) === 0) {
			throw new Error(`not executable (chmod +x needed)`)
		}
		_cliCheckCache.set(binPath, true)
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err)
		throw new Error(
			`[periscope-utils] ${name} CLI not available at ${binPath}: ${msg}. Install with: ln -s ~/Projects/claude-config/bin/${path.basename(binPath)} ${binPath}`,
		)
	}
}

/**
 * If the conversation has images but the selected provider doesn't support
 * vision, throw a clear, actionable error rather than silently dropping the
 * image or surfacing a vendor error. Catches mid-conversation provider
 * switches that move from vision-capable (ask-helmsman) to text-only
 * (ask-nvidia / ask-gemini / ask-nova / ask-claude).
 */
export function guardVisionCapability(messages: ClineStorageMessage[], provider: string, supportsImages: boolean): void {
	if (!supportsImages && messagesHaveImages(messages)) {
		throw new Error(
			`[${provider}] This conversation contains image messages, but the ${provider} provider does not support vision. ` +
				`Switch to ask-helmsman (auto-routes images to the vision proxy) or ask-nova (Bedrock Claude with vision) to continue. ` +
				`The image data has been preserved in the conversation history.`,
		)
	}
}

/**
 * Standard large-prompt guard for CLI-based providers. CLI args have OS-level
 * size limits (~256k on macOS), and large prompts cause silent hangs. Throw
 * with a clear hint instead of hanging. Mirrors the ask-helmsman guard that
 * landed in commit caf063d.
 *
 * @param prompt The flattened prompt string
 * @param provider Display name for the error message
 * @param fallbackHint Optional adapter name to recommend switching to
 * @param maxChars Override the default 80k limit
 */
export function guardLargePrompt(prompt: string, provider: string, fallbackHint = "ask-claude", maxChars = 80_000): void {
	if (prompt.length > maxChars) {
		throw new Error(
			`[${provider}] Conversation too large for CLI provider (${prompt.length.toLocaleString()} chars > ${maxChars.toLocaleString()} limit). ` +
				`Switch to ${fallbackHint} for this task, or compact the conversation history.`,
		)
	}
}

/**
 * Checks if any message in the conversation contains image data.
 * Returns true if any message block has type=image or image_url.
 */
export function messagesHaveImages(messages: ClineStorageMessage[]): boolean {
	for (const msg of messages) {
		if (Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === "image") {
					return true
				}
			}
		}
	}
	return false
}

/**
 * Flattens a conversation to a single prompt string for CLI-based providers.
 * Replaces the full Cline agentic system prompt with a lightweight one —
 * CLI providers do single-shot calls and cannot run Cline's tool-use loop.
 */
// Characters kept per-side when the flattened prompt exceeds the context budget.
// Keeps the first 20k chars (task + early context) and last 30k chars (recent tool results).
const PROMPT_BUDGET = 100_000
const PROMPT_HEAD = 20_000
const PROMPT_TAIL = 30_000

export function flattenToPrompt(systemPrompt: string, messages: ClineStorageMessage[]): string {
	const parts: string[] = []

	parts.push(`<system>\n${systemPrompt}\n</system>`)

	for (const msg of messages) {
		const role = msg.role === "assistant" ? "Assistant" : "User"
		if (typeof msg.content === "string") {
			parts.push(`${role}: ${msg.content}`)
		} else if (Array.isArray(msg.content)) {
			const textParts: string[] = []
			for (const b of msg.content) {
				if (b.type === "text" && typeof (b as any).text === "string") {
					textParts.push((b as any).text)
				} else if (b.type === "tool_result") {
					// Preserve tool results so the model can see what executed
					const content = (b as any).content
					if (typeof content === "string") {
						textParts.push(`[tool_result]: ${content}`)
					} else if (Array.isArray(content)) {
						const inner = content
							.filter((c: any) => c.type === "text")
							.map((c: any) => c.text)
							.join("\n")
						if (inner) textParts.push(`[tool_result]: ${inner}`)
					}
				} else if (b.type === "tool_use") {
					// Preserve tool calls so the model can see what it invoked
					const name = (b as any).name ?? "tool"
					const input = (b as any).input
					textParts.push(`[tool_use:${name}]: ${typeof input === "string" ? input : JSON.stringify(input)}`)
				}
			}
			if (textParts.length > 0) {
				parts.push(`${role}: ${textParts.join("\n")}`)
			}
		}
	}

	const full = parts.join("\n\n")

	// Trim to budget: keep head (task context) + tail (recent tool results)
	if (full.length > PROMPT_BUDGET) {
		const head = full.slice(0, PROMPT_HEAD)
		const tail = full.slice(-PROMPT_TAIL)
		return `${head}\n\n[... ${full.length - PROMPT_HEAD - PROMPT_TAIL} chars trimmed for context budget ...]\n\n${tail}`
	}

	return full
}
