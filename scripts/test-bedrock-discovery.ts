#!/usr/bin/env ts-node
/**
 * Test script for AWS Bedrock model discovery
 * 
 * Usage:
 *   npx ts-node scripts/test-bedrock-discovery.ts
 * 
 * Requirements:
 *   - AWS credentials configured (via environment or ~/.aws/credentials)
 *   - AWS_REGION environment variable set (or defaults to us-east-1)
 */

import { AwsBedrockHandler } from "../src/core/api/providers/bedrock"

async function main() {
	console.log("🔍 Testing AWS Bedrock Model Discovery\n")

	// Get AWS credentials from environment
	const options = {
		awsRegion: process.env.AWS_REGION || "us-east-1",
		awsAuthentication: process.env.AWS_PROFILE ? "profile" : undefined,
		awsProfile: process.env.AWS_PROFILE,
		awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
		awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
		awsSessionToken: process.env.AWS_SESSION_TOKEN,
		awsUseProfile: !!process.env.AWS_PROFILE,
	}

	console.log(`📍 Region: ${options.awsRegion}`)
	console.log(`🔐 Auth: ${options.awsAuthentication || "environment"}\n`)

	try {
		// Test 1: Get available models
		console.log("📋 Discovering available models...")
		const startTime = Date.now()
		const models = await AwsBedrockHandler.getAvailableModels(options)
		const duration = Date.now() - startTime

		console.log(`✅ Found ${models.length} models in ${duration}ms:\n`)
		models.forEach((modelId) => {
			console.log(`   • ${modelId}`)
		})

		// Test 2: Validate a specific model
		if (models.length > 0) {
			const testModelId = models[0]
			console.log(`\n🧪 Validating model: ${testModelId}`)
			const validationStart = Date.now()
			const validation = await AwsBedrockHandler.validateModel(testModelId, options)
			const validationDuration = Date.now() - validationStart

			console.log(`   Status: ${validation.isValid ? "✅ Valid" : "❌ Invalid"}`)
			console.log(`   Tool Use: ${validation.supportsToolUse ? "✅" : "❌"}`)
			console.log(`   Prompt Cache: ${validation.supportsPromptCache ? "✅" : "❌"}`)
			console.log(`   Duration: ${validationDuration}ms`)
			if (validation.error) {
				console.log(`   Error: ${validation.error}`)
			}
		}

		// Test 3: Cache behavior
		console.log("\n🔄 Testing cache (second call should be faster)...")
		const cacheStart = Date.now()
		const cachedModels = await AwsBedrockHandler.getAvailableModels(options)
		const cacheDuration = Date.now() - cacheStart
		console.log(`✅ Retrieved ${cachedModels.length} models in ${cacheDuration}ms (cached)`)

		// Test 4: Clear cache
		console.log("\n🗑️  Clearing cache...")
		AwsBedrockHandler.clearModelCache()
		console.log("✅ Cache cleared")

		console.log("\n✨ All tests completed successfully!")
	} catch (error) {
		console.error("\n❌ Error:", error instanceof Error ? error.message : String(error))
		process.exit(1)
	}
}

main()
