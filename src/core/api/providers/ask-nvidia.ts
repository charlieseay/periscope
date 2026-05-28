import OpenAI from "openai"
import { AskNvidiaModelId, askNvidiaDefaultModelId, askNvidiaModels } from "@/shared/api"
import { ClineStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import { type ApiHandler, CommonApiHandlerOptions } from ".."
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { type ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getPeriscopeSecret, guardVisionCapability, PERISCOPE_REQUEST_TIMEOUT_MS } from "./periscope-utils"

const NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1"

interface AskNvidiaHandlerOptions extends CommonApiHandlerOptions {
	apiModelId?: string
}

/**
 * Provider adapter that routes through the NVIDIA API (OpenAI-compatible endpoint).
 * Reads the API key from /Volumes/data/secrets/nvidia_api_key. Supports streaming.
 * Default provider for most Periscope tasks — cheaper than Claude Max quota.
 */
export class AskNvidiaHandler implements ApiHandler {
	private options: AskNvidiaHandlerOptions
	private client: OpenAI | null = null

	constructor(options: AskNvidiaHandlerOptions) {
		this.options = options
	}

	private async getClient(): Promise<OpenAI> {
		if (this.client) return this.client
		// Fetch via credential-manager first (TCC-safe), fall back to filesystem.
		// Bypasses the /Volumes/data sandbox restriction that bit launchd jobs.
		const apiKey = await getPeriscopeSecret("nvidia_api_key")
		this.client = new OpenAI({
			apiKey,
			baseURL: NVIDIA_API_BASE,
			timeout: PERISCOPE_REQUEST_TIMEOUT_MS,
		})
		return this.client
	}

	@withRetry({ maxRetries: 3, baseDelay: 1000, maxDelay: 8000 })
	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[]): ApiStream {
		const model = this.getModel()
		guardVisionCapability(messages, "AskNvidiaHandler", model.info.supportsImages ?? false)
		const client = await this.getClient()

		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		]

		Logger.info(`[AskNvidiaHandler] model=${model.id}, messages=${openAiMessages.length}`)

		const usage: ApiStreamUsageChunk = {
			type: "usage",
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		}

		const stream = await client.chat.completions.create({
			model: model.id,
			messages: openAiMessages,
			stream: true,
			stream_options: { include_usage: true },
			max_tokens: 32768,
		})

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
			if (delta?.content) {
				yield { type: "text", text: delta.content }
			}
			if (chunk.usage) {
				usage.inputTokens = chunk.usage.prompt_tokens ?? 0
				usage.outputTokens = chunk.usage.completion_tokens ?? 0
			}
		}

		yield usage
	}

	getModel() {
		const modelId = this.options.apiModelId
		if (modelId && modelId in askNvidiaModels) {
			const id = modelId as AskNvidiaModelId
			return { id, info: askNvidiaModels[id] }
		}
		return { id: askNvidiaDefaultModelId, info: askNvidiaModels[askNvidiaDefaultModelId] }
	}
}
