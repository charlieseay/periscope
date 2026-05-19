import { ClineStorageMessage } from "@/shared/messages/content"

export const PERISCOPE_SYSTEM_PROMPT = `You are Periscope, a helpful AI coding assistant. Answer questions clearly and concisely. When asked to help with code, provide the solution directly. Do not use XML tool tags or attempt to run commands unless explicitly shown how in this conversation.`

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
