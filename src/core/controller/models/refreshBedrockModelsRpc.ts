import { EmptyRequest, StringArray } from "@shared/proto/cline/common"
import { Controller } from ".."
import { refreshBedrockModels } from "./refreshBedrockModels"

export async function refreshBedrockModelsRpc(controller: Controller, _request: EmptyRequest): Promise<StringArray> {
	const models = await refreshBedrockModels(controller)
	return StringArray.create({ values: models })
}
