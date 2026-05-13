import {
	type ApiProvider,
	askClaudeModels,
	askGeminiModels,
	askHelmsmanModels,
	askNovaModels,
	askNvidiaModels,
} from "@shared/api"
import { type Mode } from "@shared/storage/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ModelInfoView } from "../common/ModelInfoView"
import { ModelSelector } from "../common/ModelSelector"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

const PROVIDER_MODELS: Record<string, Record<string, any>> = {
	"ask-helmsman": askHelmsmanModels,
	"ask-nvidia": askNvidiaModels,
	"ask-claude": askClaudeModels,
	"ask-gemini": askGeminiModels,
	"ask-nova": askNovaModels,
}

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
	"ask-helmsman":
		"Routes each request to the cheapest capable lane (NVIDIA → Claude → Gemini → Nova). No configuration needed — the ai-proxy classifier picks the model.",
	"ask-nvidia":
		"Direct call to NVIDIA's OpenAI-compatible API with full streaming. Reads the API key from /Volumes/data/secrets/nvidia_api_key. Best for most tasks.",
	"ask-claude":
		"Claude CLI with Claude Max subscription auth. Last-resort provider — prefer NVIDIA or Helmsman. Uses stream-JSON for proper tool support.",
	"ask-gemini":
		"Gemini via Google One subscription (ask_gemini CLI). Best for web-grounded research and large-context document analysis. Full-response (no streaming).",
	"ask-nova":
		"Claude Sonnet/Haiku 4.5 on AWS Bedrock via ask_claude_bedrock CLI. Fallback when Claude Max quota is exhausted. Full-response (no streaming).",
}

interface PeriscopeProviderProps {
	provider: ApiProvider
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

export const PeriscopeProvider = ({ provider, showModelOptions, isPopup, currentMode }: PeriscopeProviderProps) => {
	const { apiConfiguration } = useExtensionState()
	const { handleModeFieldChange } = useApiConfigurationHandlers()

	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)
	const models = PROVIDER_MODELS[provider] ?? {}
	const description = PROVIDER_DESCRIPTIONS[provider] ?? ""

	return (
		<div>
			<p
				style={{
					fontSize: "12px",
					marginTop: 3,
					marginBottom: 8,
					color: "var(--vscode-descriptionForeground)",
				}}>
				{description}
			</p>

			{showModelOptions && (
				<>
					<ModelSelector
						label="Model"
						models={models}
						onChange={(e: any) =>
							handleModeFieldChange(
								{ plan: "planModeApiModelId", act: "actModeApiModelId" },
								e.target.value,
								currentMode,
							)
						}
						selectedModelId={selectedModelId}
					/>
					{selectedModelInfo && (
						<ModelInfoView isPopup={isPopup} modelInfo={selectedModelInfo} selectedModelId={selectedModelId} />
					)}
				</>
			)}
		</div>
	)
}
