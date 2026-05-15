export interface ClineRecommendedModel {
	id: string
	name: string
	description: string
	tags: string[]
}

export interface ClineRecommendedModelsData {
	recommended: ClineRecommendedModel[]
	free: ClineRecommendedModel[]
}

/**
 * Hardcoded fallback shown when upstream recommended models are not enabled or unavailable.
 */
export const CLINE_RECOMMENDED_MODELS_FALLBACK: ClineRecommendedModelsData = {
	recommended: [
		{
			id: "google/gemini-2.5-pro-preview-05-06",
			name: "Google Gemini 2.5 Pro Preview",
			description: "Latest Gemini release with 1m ctx window and strong coding performance",
			tags: ["NEW"],
		},
		{
			id: "anthropic/claude-sonnet-4.6",
			name: "Anthropic Claude Sonnet 4.6",
			description: "Latest Sonnet release with strong coding and agent performance",
			tags: ["NEW"],
		},
		{
			id: "anthropic/claude-opus-4.6",
			name: "Anthropic Claude Opus 4.6",
			description: "Most intelligent model for agents and coding",
			tags: ["BEST"],
		},
		{
			id: "openai/gpt-4o",
			name: "OpenAI GPT-4o",
			description: "OpenAI's flagship model with strong coding abilities",
			tags: [],
		},
	],
	free: [
		{
			id: "kwaipilot/kat-coder-pro",
			name: "KwaiKAT Kat Coder Pro",
			description: "KwaiKAT's most advanced agentic coding model in the KAT-Coder series",
			tags: ["FREE"],
		},
		{
			id: "arcee-ai/trinity-large-preview:free",
			name: "Arcee AI Trinity Large Preview",
			description: "Arcee AI's advanced large preview model in the Trinity series",
			tags: ["FREE"],
		},
	],
}
