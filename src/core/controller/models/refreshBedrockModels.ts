import { AwsBedrockHandler } from "@core/api/providers/bedrock"
import { bedrockModels } from "@shared/api"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."

export async function refreshBedrockModels(controller: Controller): Promise<string[]> {
	const apiConfig = controller.stateManager.getApiConfiguration()

	try {
		const models = await AwsBedrockHandler.getAvailableModels({
			awsAccessKey: apiConfig.awsAccessKey,
			awsSecretKey: apiConfig.awsSecretKey,
			awsSessionToken: apiConfig.awsSessionToken,
			awsRegion: apiConfig.awsRegion,
			awsAuthentication: apiConfig.awsAuthentication,
			awsProfile: apiConfig.awsProfile,
			awsUseProfile: apiConfig.awsUseProfile,
		})

		if (models.length === 0) {
			Logger.warn("Bedrock model discovery returned no models, falling back to static list")
			return Object.keys(bedrockModels)
		}

		Logger.info(`Bedrock model discovery found ${models.length} available models`)
		return models
	} catch (error) {
		Logger.error("Failed to refresh Bedrock models:", error)
		return Object.keys(bedrockModels)
	}
}
