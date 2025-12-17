#!/bin/bash
# Simple build script that works around filesystem issues

set -e

echo "🔨 Building Decentralized Identity..."
echo ""

# Navigate to aiken directory
cd "$(dirname "$0")/onchain/aiken"

# Check if aiken is available
if command -v aiken &> /dev/null; then
    echo "✓ Found Aiken: $(aiken --version)"
    echo ""

    # Fetch dependencies
    echo "📦 Fetching dependencies..."
    aiken packages fetch
    echo ""

    # Run tests
    echo "🧪 Running tests..."
    aiken check
    echo ""

    # Build contracts
    echo "🏗️  Building contracts..."
    aiken build
    echo ""

    # Check output
    if [ -f "plutus.json" ]; then
        SIZE=$(wc -c < plutus.json)
        echo "✅ Build complete! Generated plutus.json ($SIZE bytes)"
    else
        echo "❌ plutus.json not found"
        exit 1
    fi
else
    echo "❌ Aiken not found. Please install:"
    echo "   curl -sSfL https://install.aiken-lang.org | bash"
    echo "   export PATH=\"\$HOME/.aiken/bin:\$PATH\""
    exit 1
fi

cd ../..
echo ""
echo "🎉 Build successful!"
