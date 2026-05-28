import { filterMessagesForClaudeCode } from "@/integrations/claude-code/message-filter"
import { runClaudeCode } from "@/integrations/claude-code/run"
import { AskClaudeModelId, askClaudeDefaultModelId, askClaudeModels } from "@/shared/api"
import { ClineStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import { type ApiHandler, CommonApiHandlerOptions } from ".."
import { withRetry } from "../retry"
import { type ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { guardVisionCapability } from "./periscope-utils"

interface AskClaudeHandlerOptions extends CommonApiHandlerOptions {
	claudeCodePath?: string
	apiModelId?: string
}

/**
 * Provider adapter that routes through the local `claude` CLI using the Claude Max subscription.
 * Uses the same stream-JSON subprocess pattern as ClaudeCodeHandler but with simpler model
 * selection (sonnet / haiku / opus aliases that always resolve to the latest in each family).
 *
 * This is the last-resort Periscope provider — prefer NVIDIA or Helmsman for most tasks.
 */
export class AskClaudeHandler implements ApiHandler {
	private options: AskClaudeHandlerOptions

	constructor(options: AskClaudeHandlerOptions) {
		this.options = options
	}

	@withRetry({
		maxRetries: 3,
		baseDelay: 2000,
		maxDelay: 10000,
	})
	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[]): ApiStream {
		const model = this.getModel()
		guardVisionCapability(messages, "AskClaudeHandler", model.info.supportsImages ?? false)
		const filteredMessages = filterMessagesForClaudeCode(messages)

		Logger.info(`[AskClaudeHandler] routing to claude CLI, model=${model.id}`)

		const claudeProcess = runClaudeCode({
			systemPrompt,
			messages: filteredMessages,
			path: this.options.claudeCodePath,
			modelId: model.id,
		})

		const usage: ApiStreamUsageChunk = {
			type: "usage",
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		}

		let isPaidUsage = true

		for await (const chunk of claudeProcess) {
			if (typeof chunk === "string") {
				yield { type: "text", text: chunk }
				continue
			}

			if (chunk.type === "system" && "subtype" in chunk) {
				if (chunk.subtype === "init") {
					isPaidUsage = (chunk as any).apiKeySource !== "none"
				}
				continue
			}

			if (chunk.type === "rate_limit_event") {
				Logger.log("[AskClaudeHandler] rate limit event:", JSON.stringify(chunk))
				continue
			}

			if (chunk.type === "user") {
				continue
			}

			if (chunk.type === "assistant" && "message" in chunk) {
				const message = chunk.message

				if (message.error) {
					const firstContent = message.content?.[0]
					const errorText = firstContent && "text" in firstContent ? firstContent.text : undefined
					throw new Error(errorText ?? `Claude error: ${message.error}`)
				}

				if (message.stop_reason !== null) {
					const firstContent = message.content?.[0]
					const content = firstContent && "text" in firstContent ? firstContent : undefined
					if (content?.text.startsWith("API Error")) {
						throw new Error(content.text)
					}
				}

				for (const content of message.content) {
					switch (content.type) {
						case "text":
							yield { type: "text", text: content.text }
							break
						case "thinking":
							yield { type: "reasoning", reasoning: content.thinking || "" }
							break
						case "redacted_thinking":
							yield { type: "reasoning", reasoning: "[Redacted thinking block]" }
							break
						case "tool_use":
							yield {
								type: "tool_calls",
								tool_call: {
									call_id: content.id,
									function: {
										id: content.id,
										name: content.name,
										arguments: JSON.stringify(content.input),
									},
								},
							}
							break
						default: {
							const unknown = content as { type: string; text?: string }
							Logger.warn(`[AskClaudeHandler] unhandled content type: ${unknown.type}`)
							if (typeof unknown.text === "string") {
								yield { type: "text", text: unknown.text }
							}
						}
					}
				}

				usage.inputTokens = message.usage?.input_tokens ?? 0
				usage.outputTokens = message.usage?.output_tokens ?? 0
				usage.cacheReadTokens = message.usage?.cache_read_input_tokens ?? 0
				usage.cacheWriteTokens = message.usage?.cache_creation_input_tokens ?? 0
				continue
			}

			if (chunk.type === "result" && "result" in chunk) {
				if (chunk.is_error) {
					throw new Error(`Claude returned an error: ${chunk.result}`)
				}
				usage.totalCost = isPaidUsage ? chunk.total_cost_usd : 0
				yield usage
				continue
			}

			if ((chunk as any).type === "error") {
				Logger.warn("[AskClaudeHandler] error chunk:", JSON.stringify(chunk))
				continue
			}

			Logger.warn(`[AskClaudeHandler] unrecognized chunk type: ${(chunk as any).type}`)
		}
	}

	getModel() {
		const modelId = this.options.apiModelId
		if (modelId && modelId in askClaudeModels) {
			const id = modelId as AskClaudeModelId
			return { id, info: askClaudeModels[id] }
		}
		return { id: askClaudeDefaultModelId, info: askClaudeModels[askClaudeDefaultModelId] }
	}
}
