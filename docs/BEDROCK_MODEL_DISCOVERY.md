# AWS Bedrock Model Discovery

## Overview

Periscope now includes automatic AWS Bedrock model discovery and validation. This system dynamically queries AWS to find available models, validates they work with your credentials, and detects their capabilities.

## Features

### 🔍 Dynamic Model Discovery
- Queries AWS `ListFoundationModels` API to discover available models
- Filters for models supporting the Converse API (required for tool use)
- Automatically discovers new models as AWS releases them
- No manual model list maintenance required

### ✅ Model Validation
- Tests each model with actual inference to verify it works
- Detects tool use support
- Detects prompt caching support
- Measures model latency
- Only shows models that work in your AWS account/region

### ⚡ Smart Caching
- Model list cached for 24 hours
- Validation results cached for 7 days
- Minimizes AWS API calls
- Cache automatically invalidates on region change

## Usage

### Get Available Models

```typescript
import { AwsBedrockHandler } from "./src/core/api/providers/bedrock"

const models = await AwsBedrockHandler.getAvailableModels({
  awsRegion: "us-east-1",
  awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
  awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsSessionToken: process.env.AWS_SESSION_TOKEN, // optional
})

console.log("Available models:", models)
// ["anthropic.claude-sonnet-4-6", "anthropic.claude-sonnet-4-5-20250929-v1:0", ...]
```

### Validate Specific Model

```typescript
const validation = await AwsBedrockHandler.validateModel(
  "anthropic.claude-sonnet-4-6",
  {
    awsRegion: "us-east-1",
    awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
)

console.log("Valid:", validation.isValid)
console.log("Supports tools:", validation.supportsToolUse)
console.log("Supports caching:", validation.supportsPromptCache)
```

### Clear Cache

```typescript
// Force fresh discovery on next request
AwsBedrockHandler.clearModelCache()
```

## Testing

Run the test script to validate the discovery system:

```bash
cd /Users/charlieseay/Projects/periscope

# With environment variables
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
npx ts-node scripts/test-bedrock-discovery.ts

# Or with AWS profile
export AWS_PROFILE=your_profile
npx ts-node scripts/test-bedrock-discovery.ts
```

Expected output:
```
🔍 Testing AWS Bedrock Model Discovery

📍 Region: us-east-1
🔐 Auth: environment

📋 Discovering available models...
✅ Found 15 models in 1234ms:

   • anthropic.claude-sonnet-4-6
   • anthropic.claude-sonnet-4-5-20250929-v1:0
   • anthropic.claude-haiku-4-5-20251001-v1:0
   ...

🧪 Validating model: anthropic.claude-sonnet-4-6
   Status: ✅ Valid
   Tool Use: ✅
   Prompt Cache: ✅
   Duration: 2345ms

🔄 Testing cache (second call should be faster)...
✅ Retrieved 15 models in 12ms (cached)

🗑️  Clearing cache...
✅ Cache cleared

✨ All tests completed successfully!
```

## Architecture

### Components

1. **BedrockModelDiscoveryService** (`src/core/api/providers/bedrock-model-discovery.ts`)
   - Core discovery and validation logic
   - Manages caching with TTL
   - Handles AWS API interactions

2. **AwsBedrockHandler Integration** (`src/core/api/providers/bedrock.ts`)
   - Static methods for discovery
   - Credential handling via existing provider chain
   - Error handling and fallbacks

3. **Model Definitions** (`src/shared/api.ts`)
   - Static model metadata (pricing, context windows)
   - Merged with discovered models
   - Fallback when discovery fails

### Data Flow

```
User Request
    ↓
AwsBedrockHandler.getAvailableModels()
    ↓
Check Cache (24hr TTL)
    ↓ (cache miss)
BedrockModelDiscoveryService.getAvailableModels()
    ↓
AWS ListFoundationModels API
    ↓
Filter for Converse API support
    ↓
Cache Results
    ↓
Return Model List
```

## Error Handling

### ModelNotEnabledException
Model requires enablement in AWS account. Currently logged as error; future versions will auto-enable.

### AccessDeniedException
User lacks IAM permissions. Ensure the IAM user/role has:
```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:ListFoundationModels",
    "bedrock:GetFoundationModel",
    "bedrock:InvokeModel"
  ],
  "Resource": "*"
}
```

### ThrottlingException
Too many API requests. The service implements exponential backoff automatically.

### ValidationException
Model ID syntax error or model doesn't exist. Model is skipped.

## Caching Strategy

### Model List Cache
- **TTL**: 24 hours
- **Key**: `bedrock-models-{region}`
- **Storage**: In-memory Map
- **Invalidation**: Region change, manual clear

### Validation Cache
- **TTL**: 7 days
- **Key**: `bedrock-validation-{modelId}-{region}`
- **Storage**: In-memory Map
- **Invalidation**: Manual clear

## Future Enhancements

### Auto-Enablement
Automatically request model access when `ModelNotEnabledException` is encountered:
```typescript
// Future implementation
if (error.name === "ModelNotEnabledException") {
  await requestModelAccess(modelId)
  // Retry after approval
}
```

### UI Integration
Add visual indicators in model selection UI:
- ✅ Available and validated
- ⏳ Pending enablement
- ❌ Not available in region
- 🔧 Requires manual approval

### Background Refresh
Periodically refresh model list in background:
```typescript
// Future implementation
setInterval(() => {
  AwsBedrockHandler.getAvailableModels(credentials)
}, 6 * 60 * 60 * 1000) // Every 6 hours
```

## Troubleshooting

### No Models Discovered
1. Check AWS credentials are valid
2. Verify IAM permissions
3. Confirm region has Bedrock models
4. Check network connectivity

### Model Validation Fails
1. Model may require enablement in AWS console
2. Check model is available in your region
3. Verify sufficient IAM permissions
4. Try clearing cache and retrying

### Slow Discovery
1. First discovery takes 2-5 seconds (normal)
2. Subsequent calls use cache (< 50ms)
3. Validation adds 1-3 seconds per model
4. Consider pre-warming cache on startup

## Related Files

- `src/core/api/providers/bedrock-model-discovery.ts` - Discovery service
- `src/core/api/providers/bedrock.ts` - Handler integration
- `src/shared/api.ts` - Model definitions
- `scripts/test-bedrock-discovery.ts` - Test script
- `BEDROCK_MODEL_DISCOVERY.md` - Implementation plan

## Commits

- `4092fdf63` - Fix Sonnet 4.6 model IDs
- `54686af87` - Implement discovery service
- `df4c2718b` - Integrate with handler
- `5fe4d98b6` - Add test script and docs
