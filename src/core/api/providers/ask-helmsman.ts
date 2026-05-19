import { execa } from "execa"
import { AskHelmsmanModelId, askHelmsmanDefaultModelId, askHelmsmanModels } from "@/shared/api"
import { ClineStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import { type ApiHandler, CommonApiHandlerOptions } from ".."
import { withRetry } from "../retry"
import { type ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { flattenToPrompt, messagesHaveImages } from "./periscope-utils"

const ASK_HELMSMAN_BIN = `${process.env.HOME}/.local/bin/ask_helmsman`

interface AskHelmsmanHandlerOptions extends CommonApiHandlerOptions {
	apiModelId?: string
}

/**
 * Provider adapter that routes through ask_helmsman CLI.
 * Helmsman classifies the prompt via the ai-proxy (localhost:5681) then dispatches
 * to the cheapest capable lane: NVIDIA → ask_claude → ask_gemini → ask_nova.
 * Use this as the default Periscope provider — it self-optimises routing per request.
 */
export class AskHelmsmanHandler implements ApiHandler {
	private options: AskHelmsmanHandlerOptions

	constructor(options: AskHelmsmanHandlerOptions) {
		this.options = options
	}

	@withRetry({ maxRetries: 2, baseDelay: 2000, maxDelay: 10000 })
	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[]): ApiStream {
		const model = this.getModel()

		// Vision fallback: if messages contain images, bypass CLI and call proxy directly
		if (messagesHaveImages(messages)) {
			Logger.info(`[AskHelmsmanHandler] vision mode detected, routing to localhost:5681`)
			yield* this.createVisionMessage(systemPrompt, messages)
			return
		}

		const prompt = flattenToPrompt(systemPrompt, messages)

		// CLI args have limits and large prompts cause silent hangs. Bail early with a
		// clear message so the user knows to switch to ask-claude for deep context tasks.
		const MAX_PROMPT_CHARS = 80_000
		if (prompt.length > MAX_PROMPT_CHARS) {
			throw new Error(
				`[AskHelmsmanHandler] Conversation too large for CLI provider (${prompt.length.toLocaleString()} chars > ${MAX_PROMPT_CHARS.toLocaleString()} limit). Switch to ask-claude or ask-nvidia provider for this task.`,
			)
		}

		// --route maps to the 4 Helmsman routes: nvidia / web / writing / code
		const routeFlag = routeForModel(model.id)
		const args = routeFlag ? ["--route", routeFlag, prompt] : [prompt]

		Logger.info(`[AskHelmsmanHandler] model=${model.id}${routeFlag ? ` route=${routeFlag}` : ""} prompt_len=${prompt.length}`)

		const usage: ApiStreamUsageChunk = {
			type: "usage",
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		}

		let result: { stdout: string; stderr: string }
		try {
			result = await execa(ASK_HELMSMAN_BIN, args, {
				timeout: 180_000,
				maxBuffer: 10_000_000,
			})
		} catch (err: unknown) {
			throw new Error(`[AskHelmsmanHandler] ask_helmsman failed: ${err instanceof Error ? err.message : String(err)}`)
		}

		const text = result.stdout.trim()
		if (!text) {
			throw new Error("[AskHelmsmanHandler] ask_helmsman returned empty response")
		}

		yield { type: "text", text }
		yield usage
	}

	/**
	 * Vision fallback: POST directly to the AI proxy at localhost:5681
	 * with the full message array including image blocks.
	 * Falls back to CLI path (text-only) if proxy is unreachable.
	 */
	private async *createVisionMessage(systemPrompt: string, messages: ClineStorageMessage[]): ApiStream {
		const usage: ApiStreamUsageChunk = {
			type: "usage",
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		}

		// Build OpenAI-compatible messages array, ensuring content is always an array
		const apiMessages = [
			{ role: "system", content: systemPrompt },
			...messages.map((msg) => ({
				role: msg.role,
				content: Array.isArray(msg.content) ? msg.content : [{ type: "text", text: msg.content }],
			})),
		]

		const payload = {
			model: "helmsman-vision",
			messages: apiMessages,
		}

		let response: Response
		try {
			// Add 30s timeout to prevent hanging indefinitely
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 30000)

			response = await fetch("http://localhost:5681/v1/chat/completions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal: controller.signal,
			})

			clearTimeout(timeoutId)
		} catch (err: unknown) {
			// If proxy is down, fall back to CLI path (text-only)
			Logger.info(
				`[AskHelmsmanHandler] vision proxy unavailable (${err instanceof Error ? err.message : String(err)}), falling back to CLI text-only path`,
			)
			const prompt = flattenToPrompt(systemPrompt, messages)
			const model = this.getModel()
			const routeFlag = routeForModel(model.id)
			const args = routeFlag ? ["--route", routeFlag, prompt] : [prompt]

			try {
				const result = await execa(ASK_HELMSMAN_BIN, args, {
					timeout: 180_000,
					maxBuffer: 10_000_000,
				})
				const text = result.stdout.trim()
				if (!text) {
					throw new Error("[AskHelmsmanHandler] ask_helmsman returned empty response")
				}
				yield { type: "text", text }
				yield usage
				return
			} catch (cliErr: unknown) {
				throw new Error(
					`[AskHelmsmanHandler] vision proxy and CLI fallback both failed: ${cliErr instanceof Error ? cliErr.message : String(cliErr)}`,
				)
			}
		}

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`[AskHelmsmanHandler] vision proxy returned ${response.status}: ${errorText}`)
		}

		const data = await response.json()
		const text = data.choices?.[0]?.message?.content?.trim()
		if (!text) {
			throw new Error("[AskHelmsmanHandler] vision proxy returned empty response")
		}

		yield { type: "text", text }
		yield usage
	}

	getModel() {
		const modelId = this.options.apiModelId
		if (modelId && modelId in askHelmsmanModels) {
			const id = modelId as AskHelmsmanModelId
			return { id, info: askHelmsmanModels[id] }
		}
		return { id: askHelmsmanDefaultModelId, info: askHelmsmanModels[askHelmsmanDefaultModelId] }
	}
}

function routeForModel(modelId: string): string | null {
	switch (modelId) {
		case "auto":
			return null // let Helmsman classify
		case "web":
			return "web"
		case "writing":
			return "writing"
		case "code":
			return "code"
		default:
			return null
	}
}
