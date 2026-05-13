import { ClineStorageMessage } from "@/shared/messages/content"

export const PERISCOPE_SYSTEM_PROMPT = `You are Periscope, a helpful AI coding assistant. Answer questions clearly and concisely. When asked to help with code, provide the solution directly. Do not use XML tool tags or attempt to run commands unless explicitly shown how in this conversation.`

/**
 * Flattens a conversation to a single prompt string for CLI-based providers.
 * Replaces the full Cline agentic system prompt with a lightweight one —
 * CLI providers do single-shot calls and cannot run Cline's tool-use loop.
 */
export function flattenToPrompt(systemPrompt: string, messages: ClineStorageMessage[]): string {
	const parts: string[] = []

	parts.push(`<system>\n${PERISCOPE_SYSTEM_PROMPT}\n</system>`)

	for (const msg of messages) {
		const role = msg.role === "assistant" ? "Assistant" : "User"
		if (typeof msg.content === "string") {
			parts.push(`${role}: ${msg.content}`)
		} else if (Array.isArray(msg.content)) {
			const textParts = msg.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text)
			if (textParts.length > 0) {
				parts.push(`${role}: ${textParts.join("\n")}`)
			}
		}
	}

	return parts.join("\n\n")
}
