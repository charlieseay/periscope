import { Logger } from "@/shared/services/Logger"
import type { FeatureFlagsAndPayloads, IFeatureFlagsProvider } from "./providers/IFeatureFlagsProvider"

/**
 * Supported feature flags provider types
 */
export type FeatureFlagsProviderType = "posthog" | "no-op"
export interface FeatureFlagsProviderConfig {
	type: FeatureFlagsProviderType
}

export class FeatureFlagsProviderFactory {
	public static createProvider(_config: FeatureFlagsProviderConfig): IFeatureFlagsProvider {
		return new NoOpFeatureFlagsProvider()
	}

	public static getDefaultConfig(): FeatureFlagsProviderConfig {
		return { type: "no-op" }
	}
}

/**
 * No-operation feature flags provider for when feature flags are disabled
 * or for testing purposes
 */
class NoOpFeatureFlagsProvider implements IFeatureFlagsProvider {
	async getAllFlagsAndPayloads(_: { flagKeys?: string[] }): Promise<FeatureFlagsAndPayloads | undefined> {
		return {}
	}

	public isEnabled(): boolean {
		return true
	}

	public getSettings() {
		return {
			enabled: true,
			timeout: 1000,
		}
	}

	public async dispose(): Promise<void> {
		Logger.info("[NoOpFeatureFlagsProvider] Disposing")
	}
}
