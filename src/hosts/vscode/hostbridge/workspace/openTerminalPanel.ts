import { OpenTerminalRequest, OpenTerminalResponse } from "@/shared/proto/index.host"

export async function openTerminalPanel(_: OpenTerminalRequest): Promise<OpenTerminalResponse> {
	// Periscope: suppress terminal focus — keep UI clean
	return {}
}
