# AWS Bedrock Model Discovery & Validation Plan

## Problem Statement
- Bedrock model IDs need to be manually maintained and can become outdated
- No validation that models actually work before showing them to users
- Models requiring AWS-side enablement aren't automatically activated
- New AWS models aren't automatically discovered

## Solution Architecture

### 1. Dynamic Model Discovery
Use AWS Bedrock's `ListFoundationModels` API to discover available models:
- Query AWS for all foundation models in the user's region
- Filter for models that support the Converse API (required for tool use)
- Cache results with TTL to avoid excessive API calls
- Merge with hardcoded model definitions for pricing/metadata

### 2. Model Validation
Before showing a model to users:
- Test basic inference with a simple prompt
- Verify tool calling support if required
- Check for prompt caching support
- Validate context window and token limits

### 3. Auto-Enablement
For models requiring activation:
- Detect "ModelNotEnabledException" errors
- Use AWS Bedrock's model access APIs to request access
- Handle approval workflows (some models require manual approval)
- Retry after enablement

### 4. Implementation Steps

#### Phase 1: Add AWS SDK Dependencies
```bash
cd /Users/charlieseay/Projects/periscope
npm install @aws-sdk/client-bedrock
```

#### Phase 2: Create Model Discovery Service
File: `src/core/api/providers/bedrock-model-discovery.ts`
- `discoverModels()` - Query AWS for available models
- `validateModel()` - Test model with simple inference
- `enableModel()` - Request model access if needed
- `getCachedModels()` - Return cached model list with TTL

#### Phase 3: Update Bedrock Handler
- Call discovery service on initialization
- Merge discovered models with hardcoded definitions
- Filter out models that fail validation
- Show only working models in UI

#### Phase 4: Add Model Testing CLI
Create a test script to validate all models:
```bash
npm run test:bedrock-models
```

## AWS APIs Required

### ListFoundationModels
```typescript
import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock"

const client = new BedrockClient({ region: "us-east-1" })
const response = await client.send(new ListFoundationModelsCommand({
  byProvider: "Anthropic",
  byOutputModality: "TEXT",
  byInferenceType: "ON_DEMAND"
}))
```

### GetFoundationModel
```typescript
import { GetFoundationModelCommand } from "@aws-sdk/client-bedrock"

const response = await client.send(new GetFoundationModelCommand({
  modelIdentifier: "anthropic.claude-sonnet-4-6"
}))
```

### PutModelInvocationLoggingConfiguration (for enablement)
Some models auto-enable on first use, others require explicit access requests.

## Model ID Patterns

### Current Bedrock Naming Conventions:
- **Claude 4.6+**: `anthropic.claude-sonnet-4-6` (no version suffix)
- **Claude 4.5**: `anthropic.claude-sonnet-4-5-20250929-v1:0` (with version)
- **Claude 3.x**: `anthropic.claude-3-5-sonnet-20241022-v2:0` (with version)
- **Nova**: `amazon.nova-pro-v1:0`
- **DeepSeek**: `deepseek.r1-v1:0`

### Extended Context Variants:
- Standard: `anthropic.claude-sonnet-4-6`
- 1M context: `anthropic.claude-sonnet-4-6:1m` (suffix, not in AWS API)

## Caching Strategy
- Cache discovered models for 24 hours
- Invalidate cache when user changes region
- Store in extension global state
- Background refresh every 6 hours

## Error Handling
- `ModelNotEnabledException` → Auto-enable if possible
- `ValidationException` → Model ID syntax error, skip model
- `AccessDeniedException` → User lacks IAM permissions
- `ThrottlingException` → Backoff and retry

## Testing Strategy
1. Unit tests for discovery service
2. Integration tests with AWS (requires credentials)
3. Mock tests for CI/CD
4. Manual smoke tests for each model family

## Rollout Plan
1. ✅ Fix immediate Sonnet 4.6 model ID issue
2. ✅ Add @aws-sdk/client-bedrock dependency
3. ✅ Implement discovery service (read-only first)
4. ✅ Add validation layer
5. ✅ Integrate with AwsBedrockHandler (static methods)
6. ✅ Create test script for validation
7. Implement auto-enablement
8. Add UI indicators for model status
9. Full rollout with monitoring

## Benefits
- Always up-to-date with latest AWS models
- No broken model options shown to users
- Automatic model enablement reduces friction
- Better error messages and troubleshooting
- Reduced maintenance burden
