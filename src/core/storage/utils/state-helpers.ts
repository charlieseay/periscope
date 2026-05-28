import { ApiProvider } from "@shared/api"
import type { ClineFileStorage } from "@shared/storage/ClineFileStorage"
import {
	applyTransform,
	GlobalStateAndSettingKeys,
	GlobalStateAndSettings,
	getDefaultValue,
	isAsyncProperty,
	isComputedProperty,
	LocalState,
	LocalStateKeys,
	SecretKeys,
	Secrets,
} from "@shared/storage/state-keys"
import { Logger } from "@/shared/services/Logger"
import { ClineMemento } from "@/shared/storage"
import { readTaskHistoryFromState } from "../disk"
import { StateManager } from "../StateManager"

// Recognised periscope provider IDs that can come from workspace config.
// Used to validate `periscope.defaultProvider` before applying it — keeps a
// typo in `.vscode/settings.json` from selecting a non-existent provider.
const VALID_PERISCOPE_PROVIDERS: ReadonlyArray<ApiProvider> = [
	"ask-helmsman",
	"ask-nvidia",
	"ask-claude",
	"ask-gemini",
	"ask-nova",
	"bedrock",
	"ollama",
]

/**
 * Read `periscope.defaultProvider` from VS Code workspace config if available
 * AND valid. Returns null when running outside a VS Code host (e.g., standalone
 * CLI) or when the configured value isn't a recognised provider.
 *
 * Used as a per-workspace fallback when no global state value is set yet —
 * lets users default to ask-nvidia in one repo and ask-claude in another via
 * `.vscode/settings.json`.
 */
function getWorkspaceProviderFallback(): ApiProvider | null {
	try {
		// Lazy import: keeps standalone (non-VS-Code) builds from breaking when
		// the vscode module isn't available at runtime.
		// biome-ignore lint/correctness/noNodejsModules: optional VS Code host detection
		const vscode = require("vscode")
		if (!vscode?.workspace?.getConfiguration) return null
		const cfg = vscode.workspace.getConfiguration("periscope")
		const raw = cfg.get("defaultProvider") as string | undefined
		if (!raw) return null
		if (VALID_PERISCOPE_PROVIDERS.includes(raw as ApiProvider)) {
			return raw as ApiProvider
		}
		Logger.warn(`[StateHelpers] periscope.defaultProvider="${raw}" is not a recognised provider, ignoring`)
		return null
	} catch {
		// vscode module unavailable (standalone build) — no fallback.
		return null
	}
}

// ─── File-backed storage readers (used by StateManager) ────────────────────

/**
 * Read secrets from a ClineFileStorage instance.
 */
export function readSecretsFromStorage(store: ClineFileStorage<string>): Secrets {
	return SecretKeys.reduce((acc, key) => {
		acc[key] = store.get(key)
		return acc
	}, {} as Secrets)
}

/**
 * Read workspace state from a ClineFileStorage instance.
 */
export function readWorkspaceStateFromStorage(store: ClineFileStorage): LocalState {
	return LocalStateKeys.reduce((acc, key) => {
		acc[key] = store.get(key) || {}
		return acc
	}, {} as LocalState)
}

/**
 * Read global state from a ClineFileStorage instance.
 */
export async function readGlobalStateFromStorage(store: ClineMemento): Promise<GlobalStateAndSettings> {
	try {
		// Batch read all state values in a single optimized pass
		const stateValues = new Map<string, any>()
		for (const key of GlobalStateAndSettingKeys) {
			const value = store.get(key as string)
			stateValues.set(key, value)
		}

		const result = {} as any

		for (const key of GlobalStateAndSettingKeys) {
			const stateKey = key as keyof GlobalStateAndSettings
			let value = stateValues.get(stateKey)

			if (isAsyncProperty(stateKey)) {
				continue
			}
			if (isComputedProperty(stateKey)) {
				continue
			}
			if (value === undefined) {
				const defaultValue = getDefaultValue(stateKey)
				if (defaultValue !== undefined) {
					value = defaultValue
				}
			}
			if (value !== undefined) {
				value = applyTransform(stateKey, value)
			}
			result[stateKey] = value
		}

		await handleComputedProperties(result, stateValues)
		await handleAsyncProperties(result)

		return result as GlobalStateAndSettings
	} catch (error) {
		Logger.error("[StateHelpers] Failed to read global state from storage:", error)
		throw error
	}
}

// ─── Legacy readers (for VSCode migration — reads from ExtensionContext) ────

/**
 * Handle properties that require computed logic
 */
async function handleComputedProperties(result: any, stateValues: Map<string, any>): Promise<void> {
	// 1. API Provider logic - precedence: explicit state -> workspace config -> built-in default.
	// Workspace config (`periscope.defaultProvider` in .vscode/settings.json) lets users
	// pick per-repo defaults — e.g., ask-nvidia for fast iteration repos, ask-claude for
	// quality-critical repos. Falls back to ask-helmsman when nothing is configured.
	const workspaceFallback = getWorkspaceProviderFallback()
	const defaultApiProvider: ApiProvider = workspaceFallback ?? "ask-helmsman"
	result.planModeApiProvider = result.planModeApiProvider || defaultApiProvider
	result.actModeApiProvider = result.actModeApiProvider || defaultApiProvider

	// 2. Plan/Act separate models setting with special logic
	const planActSeparateModelsSettingRaw = stateValues.get("planActSeparateModelsSetting")
	if (planActSeparateModelsSettingRaw === true || planActSeparateModelsSettingRaw === false) {
		result.planActSeparateModelsSetting = planActSeparateModelsSettingRaw
	} else {
		// Default to false when not explicitly set
		result.planActSeparateModelsSetting = false
	}
}

/**
 * Handle properties that require async operations
 */
async function handleAsyncProperties(result: any): Promise<void> {
	// Task history requires async disk read
	result.taskHistory = await readTaskHistoryFromState()
}

export async function resetWorkspaceState() {
	const stateManager = StateManager.get()
	LocalStateKeys.map((key) => stateManager.setWorkspaceState(key, {}))
	await stateManager.reInitialize()
}

export async function resetGlobalState() {
	// TODO: Reset all workspace states?
	const stateManager = StateManager.get()
	GlobalStateAndSettingKeys.map((key) => stateManager.setGlobalState(key, undefined))
	SecretKeys.map((key) => stateManager.setSecret(key, undefined))
	await stateManager.reInitialize()
}
