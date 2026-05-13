import { Logger } from "@/shared/services/Logger"
import type { ITelemetryProvider, TelemetryProperties, TelemetrySettings } from "./providers/ITelemetryProvider"

export type TelemetryProviderType = "posthog" | "no-op" | "opentelemetry"
export type TelemetryProviderConfig = { type: TelemetryProviderType; [key: string]: unknown }

export class TelemetryProviderFactory {
	public static async createProviders(): Promise<ITelemetryProvider[]> {
		Logger.info("TelemetryProviderFactory: Periscope internal fork — telemetry disabled")
		return [new NoOpTelemetryProvider()]
	}

	public static getDefaultConfigs(): TelemetryProviderConfig[] {
		return [{ type: "no-op" }]
	}
}

/**
 * No-operation telemetry provider for when telemetry is disabled
 * or for testing purposes
 */
export class NoOpTelemetryProvider implements ITelemetryProvider {
	readonly name = "NoOpTelemetryProvider"
	private isOptIn = true

	log(_event: string, _properties?: TelemetryProperties): void {
		Logger.log(`[NoOpTelemetryProvider] ${_event}: ${JSON.stringify(_properties)}`)
	}
	logRequired(_event: string, _properties?: TelemetryProperties): void {
		Logger.log(`[NoOpTelemetryProvider] REQUIRED ${_event}: ${JSON.stringify(_properties)}`)
	}
	identifyUser(_userInfo: any, _properties?: TelemetryProperties): void {
		Logger.info(`[NoOpTelemetryProvider] identifyUser - ${JSON.stringify(_userInfo)} - ${JSON.stringify(_properties)}`)
	}
	isEnabled(): boolean {
		return false
	}
	getSettings(): TelemetrySettings {
		return {
			hostEnabled: false,
			level: "off",
		}
	}
	recordCounter(
		_name: string,
		_value: number,
		_attributes?: TelemetryProperties,
		_description?: string,
		_required = false,
	): void {
		// no-op
	}
	recordHistogram(
		_name: string,
		_value: number,
		_attributes?: TelemetryProperties,
		_description?: string,
		_required = false,
	): void {
		// no-op
	}
	recordGauge(
		_name: string,
		_value: number | null,
		_attributes?: TelemetryProperties,
		_description?: string,
		_required = false,
	): void {
		// no-op
	}

	async forceFlush() {}
	async dispose(): Promise<void> {
		Logger.info(`[NoOpTelemetryProvider] Disposing (optIn=${this.isOptIn})`)
	}
}
