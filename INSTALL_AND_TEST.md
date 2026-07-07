# Periscope Installation & Validation

**Built:** 2026-07-07 12:11 CDT  
**Version:** 1.0.0  
**Package:** `~/Projects/periscope/dist/periscope.vsix` (10.1 MB)

---

## Installation Steps

### 1. Install the Extension

```bash
# From VS Code:
# - Open Command Palette (Cmd+Shift+P)
# - Type "Extensions: Install from VSIX..."
# - Select ~/Projects/periscope/dist/periscope.vsix

# OR from terminal:
code --install-extension ~/Projects/periscope/dist/periscope.vsix --force
```

### 2. Verify Installation

```bash
code --list-extensions | grep periscope
# Expected: seayniclabs.periscope
```

### 3. Reload VS Code

Close and reopen VS Code to activate the extension.

---

## Provider Validation Tests

### Test 1: Verify Provider List

1. Open Periscope panel (sidebar icon or Cmd+Shift+P → "Periscope")
2. Click settings gear (⚙) in top right
3. **Expected providers in dropdown:**
   - `ask-helmsman` (default — auto-routes to cheapest lane)
   - `ask-nvidia` (NVIDIA API — fast/balanced/code/thinking lanes)
   - `ask-claude` (Claude Max subscription CLI)
   - `ask-gemini` (Google One subscription CLI)
   - `ask-nova` (AWS Bedrock Nova models)
   - `bedrock` (AWS Bedrock — full model catalog)
   - `ollama` (local models)

### Test 2: Helmsman Provider (Default)

**Purpose:** Routes through Helmsman's auto-classification — NVIDIA first, escalates to Claude/Gemini/Nova as needed.

1. Select provider: `ask-helmsman`
2. Model: `auto` (default)
3. Send message: `"What is the capital of France?"`
4. **Expected:** Response comes back within 5-10 seconds
5. **Verify:** No errors in VS Code Developer Tools console (Help → Toggle Developer Tools)

### Test 3: NVIDIA Provider (Fast Lane)

**Purpose:** Direct NVIDIA API access — fastest, cheapest for simple tasks.

1. Select provider: `ask-nvidia`
2. Model: `fast` (qwen2.5:4b)
3. Send message: `"Write a Python function to reverse a string"`
4. **Expected:** Code block with a working function
5. **Verify:** No timeout errors

### Test 4: Claude Provider (Subscription)

**Purpose:** Uses Claude Max subscription — preserves quota by not using it by default.

1. Select provider: `ask-claude`
2. Model: `claude-sonnet-4-5`
3. Send message: `"Explain dependency injection in 2 sentences"`
4. **Expected:** Concise, high-quality response
5. **Verify:** No "API key missing" errors

### Test 5: Gemini Provider (Subscription)

**Purpose:** Google One Premium subscription CLI — free tier for most work.

1. Select provider: `ask-gemini`
2. Model: `gemini-2-5-flash-exp`
3. Send message: `"What's the weather like today?"` (requires web grounding)
4. **Expected:** Response with search-grounded answer
5. **Verify:** No authentication errors

### Test 6: Settings Persistence

1. Select a non-default provider (e.g., `ask-nvidia`)
2. Select a non-default model (e.g., `code`)
3. Close VS Code completely
4. Reopen VS Code
5. Open Periscope panel → Settings
6. **Expected:** Provider `ask-nvidia` and model `code` still selected

### Test 7: File Operations

**Purpose:** Verify Periscope can read/write files (core functionality).

1. Select any provider
2. Send message: `"Create a new file called test.txt with the content 'Hello from Periscope'"`
3. **Expected:** Tool use → file created → confirmation message
4. **Verify:** File exists in workspace with correct content

### Test 8: Multi-turn Conversation

**Purpose:** Verify context is maintained across messages.

1. Select any provider
2. Message 1: `"My favorite color is blue"`
3. Message 2: `"What is my favorite color?"`
4. **Expected:** Response mentions "blue"

---

## Success Criteria

✅ **Extension installed** (shows in Extensions list)  
✅ **Periscope panel opens** (no UI errors)  
✅ **All 5 custom providers listed** (ask-helmsman through ask-nova)  
✅ **Helmsman provider works** (auto-routing verified)  
✅ **NVIDIA provider works** (fast lane responds)  
✅ **Claude provider works** (subscription CLI accessible)  
✅ **Gemini provider works** (web grounding functional)  
✅ **Settings persist** (reload test passes)  
✅ **File operations work** (can create/read/write files)  
✅ **Context maintained** (multi-turn conversation works)

**If all ✅ pass:** Periscope is ready for daily use. Disable the official Claude Code extension and switch to Periscope.

---

## Troubleshooting

### "Provider not found" error

**Cause:** CLI tool not in PATH  
**Fix:** Verify tools exist:

```bash
which ask_helmsman  # ~/.local/bin/ask_helmsman
which ask_nvidia     # ~/.local/bin/ask_nvidia
which ask_claude     # ~/.local/bin/ask_claude (should be 'claude' CLI)
which ask_gemini     # ~/.local/bin/ask_gemini (should be 'gemini' or 'agy' CLI)
```

### "Authentication failed" error

**Cause:** Missing API keys or expired subscriptions  
**Fix:** Check credentials:

```bash
# NVIDIA API key
cat /Volumes/data/secrets/nvidia_api_key

# Claude Max subscription
claude --version  # Should show subscription status

# Google One Premium
gemini --version  # OR agy --version
```

### Streaming stalls / no response

**Cause:** Provider subprocess timing out  
**Fix:** Check VS Code Developer Tools console for errors:
- Help → Toggle Developer Tools
- Look for red errors in Console tab
- Common: timeout, exec error, JSON parse failure

### "Tool use failed" errors

**Cause:** File permissions or incorrect tool schema  
**Fix:** Check workspace permissions, verify file paths are absolute

---

## Rollback Plan

If Periscope doesn't work as expected:

1. Uninstall Periscope:
   ```bash
   code --uninstall-extension seayniclabs.periscope
   ```

2. Re-enable official Claude Code extension:
   - Extensions panel → Search "Claude Dev"
   - Click "Enable" if disabled

3. Report issues to Charlie with:
   - Which test failed
   - Error messages from Developer Tools console
   - Provider + model configuration attempted

---

## Post-Validation: Cutover Checklist

Once all tests pass:

- [ ] Disable official Claude Code extension (keeps it installed, just inactive)
- [ ] Set Periscope as default coding agent
- [ ] Add Periscope keyboard shortcut (Settings → Keyboard Shortcuts → search "periscope")
- [ ] Update `~/.claude/CLAUDE.md` to reference Periscope as primary tool
- [ ] Monitor first week: track which providers are used most, any errors
- [ ] Measure cost savings: compare Claude Max usage before/after (should drop 80-90%)

---

## Next Steps After Cutover

1. **Feature backlog:** See `Projects/Periscope/Features — From Reckoner.md`
   - FEAT-05: Vision/image verification
   - FEAT-04: Dependency UX hints
   - FEAT-02: Per-message attribution
   - FEAT-03: Vault slash commands
   - FEAT-01: Confidence-based Bearing escalation

2. **Monitoring:** Track provider performance in first 2 weeks
   - Which providers timeout most?
   - Quality comparison: NVIDIA vs Claude for code tasks
   - Cost per task (aim for $0 on 90% of work)

3. **Documentation:** Write internal runbook for team
   - When to use which provider
   - Troubleshooting common issues
   - How to add new providers

---

**Built by:** Claude Code (session 2026-07-07)  
**Commit:** `3368293f8` (feat: Bedrock model discovery)  
**Status:** ✅ Ready for installation and testing
