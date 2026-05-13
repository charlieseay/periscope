import { execa } from "execa"
import { AskHelmsmanModelId, askHelmsmanDefaultModelId, askHelmsmanModels } from "@/shared/api"
import { ClineStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import { type ApiHandler, CommonApiHandlerOptions } from ".."
import { withRetry } from "../retry"
import { type ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { flattenToPrompt } from "./periscope-utils"

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
		const prompt = flattenToPrompt(systemPrompt, messages)

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
		} catch (err: any) {
			throw new Error(`[AskHelmsmanHandler] ask_helmsman failed: ${err.message ?? err}`)
		}

		const text = result.stdout.trim()
		if (!text) {
			throw new Error("[AskHelmsmanHandler] ask_helmsman returned empty response")
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
