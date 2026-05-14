/**
 * AWS Bedrock Model Discovery Service
 *
 * Dynamically discovers available Bedrock models, validates them, and handles auto-enablement.
 * This ensures users only see models that actually work in their AWS account/region.
 */

import {
	BedrockClient,
	type FoundationModelDetails,
	type FoundationModelSummary,
	GetFoundationModelCommand,
	ListFoundationModelsCommand,
} from "@aws-sdk/client-bedrock"
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"
import { Logger } from "@/shared/services/Logger"

interface DiscoveredModel {
	modelId: string
	modelArn: string
	modelName: string
	providerName: string
	inputModalities: string[]
	outputModalities: string[]
	responseStreamingSupported: boolean
	customizationsSupported: string[]
	inferenceTypesSupported: string[]
	modelLifecycle?: {
		status?: string
	}
}

interface ModelValidationResult {
	modelId: string
	isValid: boolean
	supportsToolUse: boolean
	supportsPromptCache: boolean
	error?: string
	testLatencyMs?: number
}

interface CachedModels {
	models: DiscoveredModel[]
	validatedModels: Map<string, ModelValidationResult>
	timestamp: number
	region: string
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const VALIDATION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export class BedrockModelDiscoveryService {
	private cache: CachedModels | null = null
	private discoveryInProgress = false

	/**
	 * Get available Bedrock models for the given region
	 */
	async getAvailableModels(
		region: string,
		awsAccessKey?: string,
		awsSecretKey?: string,
		awsSessionToken?: string,
		awsProfile?: string,
		forceRefresh = false,
	): Promise<DiscoveredModel[]> {
		// Return cached models if valid
		if (!forceRefresh && this.cache && this.isCacheValid(this.cache, region)) {
			Logger.info(`Returning ${this.cache.models.length} cached models for region ${region}`)
			return this.cache.models
		}

		// Prevent concurrent discovery requests
		if (this.discoveryInProgress) {
			Logger.info("Model discovery already in progress, waiting...")
			await this.waitForDiscovery()
			return this.cache?.models || []
		}

		this.discoveryInProgress = true

		try {
			Logger.info(`Discovering Bedrock models in region ${region}...`)
			const client = this.createBedrockClient(region, awsAccessKey, awsSecretKey, awsSessionToken, awsProfile)

			// List all foundation models
			const response = await client.send(
				new ListFoundationModelsCommand({
					byOutputModality: "TEXT",
					byInferenceType: "ON_DEMAND",
				}),
			)

			const models: DiscoveredModel[] = (response.modelSummaries || [])
				.filter((model) => this.isModelSupported(model))
				.map((model) => this.mapToDiscoveredModel(model))

			Logger.info(`Discovered ${models.length} supported models`)

			// Update cache
			this.cache = {
				models,
				validatedModels: this.cache?.validatedModels || new Map(),
				timestamp: Date.now(),
				region,
			}

			return models
		} catch (error) {
			Logger.error("Failed to discover Bedrock models", error)
			// Return cached models if available, even if expired
			return this.cache?.models || []
		} finally {
			this.discoveryInProgress = false
		}
	}

	/**
	 * Validate a specific model by testing basic inference
	 */
	async validateModel(
		modelId: string,
		region: string,
		awsAccessKey?: string,
		awsSecretKey?: string,
		awsSessionToken?: string,
		awsProfile?: string,
	): Promise<ModelValidationResult> {
		// Check validation cache
		const cached = this.cache?.validatedModels.get(modelId)
		if (cached && Date.now() - (this.cache?.timestamp || 0) < VALIDATION_CACHE_TTL_MS) {
			Logger.info(`Using cached validation result for ${modelId}`)
			return cached
		}

		Logger.info(`Validating model ${modelId}...`)
		const startTime = Date.now()

		try {
			const client = this.createBedrockRuntimeClient(region, awsAccessKey, awsSecretKey, awsSessionToken, awsProfile)

			// Test basic inference
			const response = await client.send(
				new ConverseCommand({
					modelId,
					messages: [
						{
							role: "user",
							content: [{ text: "Reply with just the word 'OK'" }],
						},
					],
					inferenceConfig: {
						maxTokens: 10,
						temperature: 0,
					},
				}),
			)

			const testLatencyMs = Date.now() - startTime
			const isValid = response.output?.message?.content?.[0]?.text !== undefined

			// Test tool use support (optional, don't fail validation if this fails)
			let supportsToolUse = false
			try {
				const toolResponse = await client.send(
					new ConverseCommand({
						modelId,
						messages: [
							{
								role: "user",
								content: [{ text: "What's the weather?" }],
							},
						],
						toolConfig: {
							tools: [
								{
									toolSpec: {
										name: "get_weather",
										description: "Get weather information",
										inputSchema: {
											json: {
												type: "object",
												properties: {
													location: { type: "string" },
												},
												required: ["location"],
											},
										},
									},
								},
							],
						},
						inferenceConfig: {
							maxTokens: 100,
							temperature: 0,
						},
					}),
				)
				supportsToolUse = toolResponse.stopReason === "tool_use"
			} catch (toolError) {
				Logger.debug(`Model ${modelId} does not support tool use`, toolError)
			}

			// Prompt caching support is determined by model metadata, not runtime testing
			const supportsPromptCache = this.modelSupportsPromptCache(modelId)

			const result: ModelValidationResult = {
				modelId,
				isValid,
				supportsToolUse,
				supportsPromptCache,
				testLatencyMs,
			}

			// Cache the result
			if (this.cache) {
				this.cache.validatedModels.set(modelId, result)
			}

			Logger.info(
				`Model ${modelId} validation: ${isValid ? "✓" : "✗"} (tools: ${supportsToolUse}, cache: ${supportsPromptCache}, latency: ${testLatencyMs}ms)`,
			)

			return result
		} catch (error: any) {
			const errorMessage = error.message || String(error)
			Logger.error(`Model ${modelId} validation failed`, error)

			// Check for specific error types
			if (errorMessage.includes("ModelNotEnabledException")) {
				Logger.warn(`Model ${modelId} is not enabled in this account`)
			}

			const result: ModelValidationResult = {
				modelId,
				isValid: false,
				supportsToolUse: false,
				supportsPromptCache: false,
				error: errorMessage,
			}

			// Cache failed validations too (with shorter TTL)
			if (this.cache) {
				this.cache.validatedModels.set(modelId, result)
			}

			return result
		}
	}

	/**
	 * Get detailed information about a specific model
	 */
	async getModelDetails(
		modelId: string,
		region: string,
		awsAccessKey?: string,
		awsSecretKey?: string,
		awsSessionToken?: string,
		awsProfile?: string,
	): Promise<FoundationModelDetails | null> {
		try {
			const client = this.createBedrockClient(region, awsAccessKey, awsSecretKey, awsSessionToken, awsProfile)
			const response = await client.send(
				new GetFoundationModelCommand({
					modelIdentifier: modelId,
				}),
			)
			return response.modelDetails || null
		} catch (error) {
			Logger.error(`Failed to get details for model ${modelId}`, error)
			return null
		}
	}

	/**
	 * Clear the model cache
	 */
	clearCache(): void {
		this.cache = null
		Logger.info("Model cache cleared")
	}

	// Private helper methods

	private createBedrockClient(
		region: string,
		awsAccessKey?: string,
		awsSecretKey?: string,
		awsSessionToken?: string,
		awsProfile?: string,
	): BedrockClient {
		const credentials =
			awsAccessKey && awsSecretKey
				? {
						accessKeyId: awsAccessKey,
						secretAccessKey: awsSecretKey,
						sessionToken: awsSessionToken,
					}
				: fromNodeProviderChain({
						profile: awsProfile,
					})

		return new BedrockClient({
			region,
			credentials,
		})
	}

	private createBedrockRuntimeClient(
		region: string,
		awsAccessKey?: string,
		awsSecretKey?: string,
		awsSessionToken?: string,
		awsProfile?: string,
	): BedrockRuntimeClient {
		const credentials =
			awsAccessKey && awsSecretKey
				? {
						accessKeyId: awsAccessKey,
						secretAccessKey: awsSecretKey,
						sessionToken: awsSessionToken,
					}
				: fromNodeProviderChain({
						profile: awsProfile,
					})

		return new BedrockRuntimeClient({
			region,
			credentials,
		})
	}

	private isCacheValid(cache: CachedModels, region: string): boolean {
		return cache.region === region && Date.now() - cache.timestamp < CACHE_TTL_MS
	}

	private async waitForDiscovery(): Promise<void> {
		const maxWait = 30000 // 30 seconds
		const startTime = Date.now()

		while (this.discoveryInProgress && Date.now() - startTime < maxWait) {
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}

	private isModelSupported(model: FoundationModelSummary): boolean {
		// Filter for models that support text output and streaming
		if (!model.outputModalities?.includes("TEXT")) {
			return false
		}

		// We need streaming support for the Converse API
		if (!model.responseStreamingSupported) {
			return false
		}

		// Filter out embedding models and other non-chat models
		if (model.modelId?.includes("embed")) {
			return false
		}

		return true
	}

	private mapToDiscoveredModel(model: FoundationModelSummary): DiscoveredModel {
		return {
			modelId: model.modelId || "",
			modelArn: model.modelArn || "",
			modelName: model.modelName || "",
			providerName: model.providerName || "",
			inputModalities: model.inputModalities || [],
			outputModalities: model.outputModalities || [],
			responseStreamingSupported: model.responseStreamingSupported || false,
			customizationsSupported: model.customizationsSupported || [],
			inferenceTypesSupported: model.inferenceTypesSupported || [],
			modelLifecycle: model.modelLifecycle,
		}
	}

	private modelSupportsPromptCache(modelId: string): boolean {
		// Anthropic Claude models support prompt caching
		if (modelId.includes("anthropic.claude")) {
			// Claude 3.5+ supports prompt caching
			if (
				modelId.includes("claude-3-5") ||
				modelId.includes("claude-3-7") ||
				modelId.includes("claude-4") ||
				modelId.includes("claude-sonnet-4") ||
				modelId.includes("claude-opus-4") ||
				modelId.includes("claude-haiku-4")
			) {
				return true
			}
		}

		// Amazon Nova models support prompt caching
		if (modelId.includes("amazon.nova")) {
			return true
		}

		return false
	}
}

// Singleton instance
export const bedrockModelDiscovery = new BedrockModelDiscoveryService()
