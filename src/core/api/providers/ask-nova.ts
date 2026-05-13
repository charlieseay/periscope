import { execa } from "execa"
import { AskNovaModelId, askNovaDefaultModelId, askNovaModels } from "@/shared/api"
import { ClineStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import { type ApiHandler, CommonApiHandlerOptions } from ".."
import { withRetry } from "../retry"
import { type ApiStream, ApiStreamUsageChunk } from "../transform/stream"

const ASK_NOVA_BIN = `${process.env.HOME}/.local/bin/ask_claude_bedrock`

interface AskNovaHandlerOptions extends CommonApiHandlerOptions {
	apiModelId?: string
}

/**
 * Provider adapter that routes through AWS Bedrock Anthropic models via ask_claude_bedrock CLI.
 * Used when Claude Max subscription is exhausted and NVIDIA isn't suitable (code tasks, judgment).
 * Full-response provider — parses the Bedrock JSON response for text + token counts.
 */
export class AskNovaHandler implements ApiHandler {
	private options: AskNovaHandlerOptions

	constructor(options: AskNovaHandlerOptions) {
		this.options = options
	}

	@withRetry({ maxRetries: 2, baseDelay: 2000, maxDelay: 10000 })
	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[]): ApiStream {
		const model = this.getModel()

		// Map model ID to the lane flag expected by ask_claude_bedrock
		const lane = model.id === "haiku" ? "haiku" : "sonnet"
		const prompt = flattenToPrompt(systemPrompt, messages)

		Logger.info(`[AskNovaHandler] lane=${lane}, prompt_len=${prompt.length}`)

		const usage: ApiStreamUsageChunk = {
			type: "usage",
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		}

		let result: { stdout: string; stderr: string }
		try {
			result = await execa(ASK_NOVA_BIN, ["--lane", lane, "--json", prompt], {
				timeout: 120_000,
				maxBuffer: 10_000_000,
			})
		} catch (err: any) {
			const stderr = err.stderr ?? ""
			if (stderr.includes("daily") || stderr.includes("cap") || err.exitCode === 75) {
				throw new Error(`[AskNovaHandler] Bedrock daily spend cap reached: ${stderr.slice(0, 200)}`)
			}
			throw new Error(`[AskNovaHandler] ask_claude_bedrock failed: ${err.message}`)
		}

		// Parse the Bedrock JSON response for text and usage
		let text = ""
		try {
			const json = JSON.parse(result.stdout)
			// Bedrock Anthropic Messages API shape: { content: [{ type: "text", text: "..." }], usage: { input_tokens, output_tokens } }
			if (Array.isArray(json.content)) {
				for (const block of json.content) {
					if (block.type === "text" && typeof block.text === "string") {
						text += block.text
					}
				}
			}
			if (json.usage) {
				usage.inputTokens = json.usage.input_tokens ?? 0
				usage.outputTokens = json.usage.output_tokens ?? 0
			}
		} catch {
			// If JSON parse fails, treat stdout as plain text
			text = result.stdout.trim()
		}

		if (!text) {
			throw new Error("[AskNovaHandler] ask_claude_bedrock returned empty response")
		}

		yield { type: "text", text }
		yield usage
	}

	getModel() {
		const modelId = this.options.apiModelId
		if (modelId && modelId in askNovaModels) {
			const id = modelId as AskNovaModelId
			return { id, info: askNovaModels[id] }
		}
		return { id: askNovaDefaultModelId, info: askNovaModels[askNovaDefaultModelId] }
	}
}

function flattenToPrompt(systemPrompt: string, messages: ClineStorageMessage[]): string {
	const parts: string[] = []

	if (systemPrompt) {
		parts.push(`<system>\n${systemPrompt}\n</system>`)
	}

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
