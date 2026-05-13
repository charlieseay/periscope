# Periscope Phase 2 prep — Cline fork source answers

Read-only research against `~/Projects/periscope` (Cline fork). The Obsidian vault note `Periscope.md` carries the same substance for product owners; this file exists so the repo working tree is a verifiable deliverable for automation that only inspects the clone.

---

## Q1 — Streaming support per provider

Cline’s **provider surface is streaming-first**: `ApiHandler.createMessage` returns `ApiStream`, declared as an async generator of unified chunks (`text`, `reasoning`, `usage`, `tool_calls`). See `src/core/api/index.ts` at the `ApiHandler` interface (approximately lines 53–57) and chunk definitions in `src/core/api/transform/stream.ts` (lines 1–70). New providers **plug in** via `createHandlerForProvider`’s `switch (apiProvider)` in `src/core/api/index.ts` (the factory begins around line 76).

**How shipped providers behave:** Most handlers wrap a **vendor-native stream** and map events into `ApiStream`. Examples: Anthropic `createMessage` is an async generator using the Messages API with `stream: true` (`src/core/api/providers/anthropic.ts`, lines 64–134 region). OpenAI Chat Completions uses `stream: true` and `stream_options: { include_usage: true }` (`src/core/api/providers/openai.ts`, lines 136–149). Ollama uses `client.chat({ … stream: true })` and `for await` over chunks (`src/core/api/providers/ollama.ts`, lines 72–100). Gemini uses `generateContentStream` (`src/core/api/providers/gemini.ts`, lines 148–227). The Claude Code subprocess adapter streams CLI chunks and maps `tool_use` into `tool_calls` chunks (`src/core/api/providers/claude-code.ts`, lines 28–38 and 123–155).

**Non-token streaming is still compatible** with the UI pipeline: Bedrock’s `createOpenAIMessage` documents non-streaming Converse followed by **simulated** streaming by slicing completed text into fixed-size `text` chunks (`src/core/api/providers/bedrock.ts`, lines 1191–1296). That establishes Phase 2 can use **full-response-then-chunk** adapters without breaking the abstraction, at the cost of worse time-to-first-token and coarser partial UI updates.

**Phase 2 takeaway:** Helmsman / CLI / router wrappers should implement `createMessage` as an async generator yielding `ApiStream` chunks; true token streaming is ideal but not strictly required if you chunk a completed response like Bedrock does for some paths.

---

## Q2 — MCP server coupling to providers

MCP **does not** invoke LLM providers. `UseMcpToolHandler.execute` calls `config.services.mcpHub.callTool`, formats MCP `content` into display text, emits UI `say` events, and returns `formatResponse.toolResult(...)` — with provider strings used only for **telemetry** (`planModeApiProvider` / `actModeApiProvider`), not for routing the MCP RPC (`src/core/task/tools/handlers/UseMcpToolHandler.ts`, lines 46–212, especially 167–212). `McpHub.callTool` issues JSON-RPC `tools/call` to the MCP client (`src/services/mcp/McpHub.ts`, roughly lines 1234–1307) without importing `ApiHandler` or model SDKs.

**Where results re-enter the model:** Like any tool, MCP output becomes a **user-side tool result** in the persisted Anthropic-shaped transcript; `formatResponse.toolResult` builds Anthropic-compatible blocks (`src/core/prompts/responses.ts`, lines 129–153). The next model turn is still `this.api.createMessage(systemPrompt, truncatedConversationHistory, tools)` from the task (`src/core/task/index.ts`, line 2021). So the **task / agent loop sits between MCP and the provider**.

**Provider swap:** MCP keeps working if the new `ApiHandler` honors the same stream contract and the task’s conversation schema; the only coupling called out here is **model capability** (e.g. `supportsImages` when MCP returns images) in `UseMcpToolHandler` (`src/core/task/tools/handlers/UseMcpToolHandler.ts`, lines 202–206).

**Why this matters for Periscope:** you can route the chat model through Helmsman, NVIDIA, Nova, or subscription CLIs without touching `McpHub` or MCP JSON-RPC. Regression risk for MCP is therefore mostly about **downstream model behavior** (does the chosen model follow tool-result ordering, tolerate large MCP payloads, support images) rather than about duplicating MCP logic per provider. If a wrapper returns malformed `ApiStream` chunks or corrupts the transcript, MCP would “break” only indirectly—symptoms would match any broken handler, not MCP-specific wiring.

---

## Q3 — Tool-call schema normalization

**Canonical storage** is Anthropic-shaped message content: `ClineStorageMessage` extends `Anthropic.MessageParam`; assistant tool calls are `ClineAssistantToolUseBlock` (`Anthropic.ToolUseBlockParam`); user tool outputs use `ClineUserToolResultContentBlock` (`Anthropic.ToolResultBlockParam`) (`src/shared/messages/content.ts`, lines 39–49, 83–88). Comments in that file describe backward compatibility with historical transcripts.

**Outgoing wire format** is normalized per handler family:

- **OpenAI Chat Completions:** `convertToOpenAiMessages` maps `tool_use` / `tool_result` into `tool_calls` and `role: "tool"` messages, including tool ID transforms for API limits (`src/core/api/transform/openai-format.ts`, lines 67–188).
- **Anthropic API:** `sanitizeAnthropicMessages` / `convertClineStorageToAnthropicMessage` strip Cline-only fields (`src/core/api/transform/anthropic-format.ts` and `src/shared/messages/content.ts`, lines 111–131).
- **Anthropic streaming deltas:** `input_json_delta` maps to incremental `tool_calls` chunks (`src/core/api/utils/messages_api_support.ts`, lines 95–108).
- **OpenAI tool defs → Anthropic tools:** `convertOpenAIToolsToAnthropicTools` (`src/core/api/utils/messages_api_support.ts`, lines 122–149).
- **OpenAI stream accumulation:** `ToolCallProcessor` batches deltas until a complete tool call (`src/core/api/transform/tool-call-processor.ts`, lines 14–62).
- **Gemini:** messages pass through `convertAnthropicMessageToGemini`; streaming maps function-call parts back to `ApiStream` `tool_calls` (`src/core/api/providers/gemini.ts`, lines 151–152 and the stream handler region including ~256–280).

**Adapter contract:** Handlers receive `ClineStorageMessage[]` plus tools in the shape their SDK expects; each handler performs the last-mile conversion. New Periscope wrappers should **reuse** these transforms where the upstream matches OpenAI/Anthropic/Gemini, or add a dedicated mapper for proprietary Helmsman / router payloads.

**Incoming from models:** streaming handlers normalize vendor deltas into `ApiStream` (e.g. Anthropic `input_json_delta` in `messages_api_support.ts`, OpenAI deltas via `ToolCallProcessor`, Responses API events in `responses_api_support.ts`). **Outgoing to models:** the same stored transcript is converted again on the next request. That split—**canonical transcript** vs **per-request wire**—is what keeps multi-provider history coherent. A wrapper that bypasses these helpers would need to reimplement both directions or risk desynchronized tool IDs between assistant `tool_use` and user `tool_result` rows.

---

## Phase 2 risk level (LOW / MEDIUM / HIGH per planned wrapper)

| Wrapper | Risk | Rationale |
| --- | --- | --- |
| `helmsman` | **MEDIUM** | New transport + unknown wire schema outside this tree; must still emit `ApiStream` and tool chunks. |
| `ask_nvidia` | **MEDIUM** | Subprocess/HTTP bridge; tool JSON and streaming semantics must match what the task enables. |
| `nova` (Bedrock router) | **MEDIUM** | In-repo Bedrock shows Converse streaming, simulated streaming, and tool config mapping — router must match its API. |
| `ask_claude` | **LOW** | Mirror `ClaudeCodeHandler` streaming + `tool_use` → `tool_calls` (`claude-code.ts` as above). |
| `ask_gemini` | **LOW–MEDIUM** | `GeminiHandler` is the template; risk rises if subscription CLI I/O diverges from the HTTP SDK path. |
| `ollama` (upstream) | **LOW** | Existing handler already streams tools (`ollama.ts`, lines 72–100). |

---

## Pride check

A Phase 2 author can brief adapters from this document plus the vault section without re-reading all of Cline. Anything not in this repository (exact Helmsman JSON, NVIDIA CLI framing) remains explicitly external.
