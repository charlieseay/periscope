import { execa } from "execa"
import { AskGeminiModelId, askGeminiDefaultModelId, askGeminiModels } from "@/shared/api"
import { ClineStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import { type ApiHandler, CommonApiHandlerOptions } from ".."
import { withRetry } from "../retry"
import { type ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import {
	flattenToPrompt,
	guardLargePrompt,
	guardVisionCapability,
	PERISCOPE_REQUEST_TIMEOUT_MS,
	requirePeriscopeCli,
} from "./periscope-utils"

const ASK_GEMINI_BIN = `${process.env.HOME}/.local/bin/ask_gemini`

interface AskGeminiHandlerOptions extends CommonApiHandlerOptions {
	apiModelId?: string
}

/**
 * Provider adapter that routes through the ask_gemini CLI (Google One subscription).
 * Full-response provider — Gemini CLI doesn't expose streaming JSON, so the whole
 * response is buffered then yielded as a single text chunk.
 * Best for: web-grounded research, large-context document analysis.
 */
export class AskGeminiHandler implements ApiHandler {
	private options: AskGeminiHandlerOptions

	constructor(options: AskGeminiHandlerOptions) {
		this.options = options
	}

	@withRetry({ maxRetries: 2, baseDelay: 2000, maxDelay: 10000 })
	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[]): ApiStream {
		const model = this.getModel()
		guardVisionCapability(messages, "AskGeminiHandler", model.info.supportsImages ?? false)
		const prompt = flattenToPrompt(systemPrompt, messages)
		guardLargePrompt(prompt, "AskGeminiHandler", "ask-helmsman or ask-claude")

		Logger.info(`[AskGeminiHandler] model=${model.id}, prompt_len=${prompt.length}`)

		const usage: ApiStreamUsageChunk = {
			type: "usage",
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		}

		await requirePeriscopeCli(ASK_GEMINI_BIN, "ask_gemini")

		let result: { stdout: string; stderr: string }
		try {
			result = await execa(ASK_GEMINI_BIN, ["-p", prompt], {
				timeout: PERISCOPE_REQUEST_TIMEOUT_MS,
				maxBuffer: 10_000_000,
			})
		} catch (err: any) {
			const stderr = err.stderr ?? ""
			if (stderr.includes("TerminalQuotaError") || stderr.includes("quota")) {
				throw new Error(`[AskGeminiHandler] Gemini quota exhausted: ${stderr.slice(0, 200)}`)
			}
			throw new Error(`[AskGeminiHandler] ask_gemini failed: ${err.message}`)
		}

		const text = result.stdout.trim()
		if (!text) {
			throw new Error("[AskGeminiHandler] ask_gemini returned empty response")
		}

		yield { type: "text", text }
		yield usage
	}

	getModel() {
		const modelId = this.options.apiModelId
		if (modelId && modelId in askGeminiModels) {
			const id = modelId as AskGeminiModelId
			return { id, info: askGeminiModels[id] }
		}
		return { id: askGeminiDefaultModelId, info: askGeminiModels[askGeminiDefaultModelId] }
	}
}
