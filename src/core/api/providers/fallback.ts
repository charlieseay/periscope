import type { ClineStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import type { ClineTool } from "@/shared/tools"
import { type ApiHandler, type ApiHandlerModel } from ".."
import type { ApiStream } from "../transform/stream"

// Patterns that indicate the primary provider is permanently unavailable for this request.
// These should not be retried against the same provider; fall back instead.
const FALLBACK_PATTERNS = [
	// Quota / spend cap
	/too many tokens per day/i,
	/daily.*quota/i,
	/quota.*exceeded/i,
	/spend.*cap/i,
	/bedrock daily spend cap/i,
	// Invalid / unavailable model
	/model identifier is invalid/i,
	/model.*not found/i,
	/model.*not.*available/i,
	/model.*not.*enabled/i,
	/no such model/i,
]

// AWS SDK error names that always warrant a fallback (regardless of message text).
const PERMANENT_ERROR_NAMES = new Set(["ServiceQuotaExceededException"])

// AWS SDK error names that warrant a fallback only when the message matches FALLBACK_PATTERNS.
const CONDITIONAL_ERROR_NAMES = new Set(["ThrottlingException", "ValidationException"])

function shouldFallback(error: unknown): boolean {
	if (!(error instanceof Error)) return false
	const name = (error as any).name ?? ""
	if (PERMANENT_ERROR_NAMES.has(name)) return true
	if (CONDITIONAL_ERROR_NAMES.has(name)) return FALLBACK_PATTERNS.some((p) => p.test(error.message))
	return FALLBACK_PATTERNS.some((p) => p.test(error.message))
}

/**
 * Wraps a primary ApiHandler and automatically falls back to a secondary handler
 * when the primary is permanently unavailable: quota exhausted, invalid/disabled model,
 * or service quota exceeded.
 *
 * Transient errors (network blips, short-term rate limits without quota language)
 * still propagate so withRetry on the primary can handle them normally.
 */
export class FallbackApiHandler implements ApiHandler {
	private primary: ApiHandler
	private secondary: ApiHandler

	constructor(primary: ApiHandler, secondary: ApiHandler) {
		this.primary = primary
		this.secondary = secondary
	}

	async *createMessage(
		systemPrompt: string,
		messages: ClineStorageMessage[],
		tools?: ClineTool[],
		useResponseApi?: boolean,
	): ApiStream {
		try {
			yield* this.primary.createMessage(systemPrompt, messages, tools, useResponseApi)
		} catch (error) {
			if (shouldFallback(error)) {
				Logger.info(
					`[FallbackApiHandler] ${this.primary.getModel().id} unavailable — falling back to ${this.secondary.getModel().id}: ${error instanceof Error ? error.message : String(error)}`,
				)
				yield* this.secondary.createMessage(systemPrompt, messages, tools, useResponseApi)
			} else {
				throw error
			}
		}
	}

	getModel(): ApiHandlerModel {
		return this.primary.getModel()
	}

	abort(): void {
		this.primary.abort?.()
		this.secondary.abort?.()
	}
}
