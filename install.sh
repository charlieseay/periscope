#!/bin/bash
set -e

echo "🔭 Periscope Installer"
echo "====================="
echo ""

VSIX_PATH="$HOME/Projects/periscope/dist/periscope.vsix"

# Check if vsix exists
if [ ! -f "$VSIX_PATH" ]; then
    echo "❌ ERROR: periscope.vsix not found at $VSIX_PATH"
    echo "Run: cd ~/Projects/periscope && npm run package"
    exit 1
fi

echo "📦 Found: $VSIX_PATH"
echo "📊 Size: $(du -h "$VSIX_PATH" | cut -f1)"
echo ""

# Check if code CLI is available
if ! command -v code &> /dev/null; then
    echo "❌ ERROR: 'code' command not found"
    echo "Install VS Code CLI: Cmd+Shift+P → 'Shell Command: Install code command in PATH'"
    exit 1
fi

# Install extension
echo "🔧 Installing Periscope extension..."
code --install-extension "$VSIX_PATH" --force

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Restart VS Code (close all windows, reopen)"
echo "2. Open Periscope panel (Cmd+Shift+P → 'Periscope')"
echo "3. Run validation tests from INSTALL_AND_TEST.md"
echo ""
echo "🧪 Quick test:"
echo "   1. Open Periscope panel"
echo "   2. Settings gear → select 'ask-helmsman' provider"
echo "   3. Send: 'What is 2+2?'"
echo "   4. Should respond within 5 seconds"
echo ""
echo "📖 Full test plan: ~/Projects/periscope/INSTALL_AND_TEST.md"
