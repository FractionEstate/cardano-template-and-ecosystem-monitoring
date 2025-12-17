#!/bin/bash
# EXECUTE THIS SCRIPT TO INSTALL AND BUILD EVERYTHING
# Run: bash RUN_ME.sh

set -e

echo "🚀 Decentralized Identity - Complete Setup & Build"
echo "=================================================="
echo ""

# Step 1: Install Aiken
echo "Step 1: Installing Aiken..."
if ! command -v aiken &> /dev/null; then
    echo "  Downloading Aiken installer..."
    curl -sSfL https://install.aiken-lang.org | bash

    # Add to PATH
    export PATH="$HOME/.aiken/bin:$PATH"

    # Verify
    if command -v aiken &> /dev/null; then
        echo "  ✅ Aiken installed: $(aiken --version)"
    else
        echo "  ❌ Failed to install Aiken"
        echo "  Please add to PATH: export PATH=\"\$HOME/.aiken/bin:\$PATH\""
        exit 1
    fi
else
    echo "  ✅ Aiken already installed: $(aiken --version)"
fi

echo ""
echo "Step 2: Building Aiken contracts..."
cd "$(dirname "$0")/onchain/aiken"

# Fetch dependencies
echo "  Fetching packages..."
aiken packages fetch

# Run tests
echo "  Running tests..."
aiken check

# Build
echo "  Building contracts..."
aiken build

# Verify
if [ -f "plutus.json" ]; then
    SIZE=$(wc -c < plutus.json)
    echo ""
    echo "  ✅ SUCCESS! plutus.json generated ($SIZE bytes)"
else
    echo "  ❌ FAILED! plutus.json not found"
    exit 1
fi

echo ""
echo "Step 3: Caching Deno dependencies..."

# Install Deno if needed
if ! command -v deno &> /dev/null; then
    echo "  Installing Deno..."
    curl -fsSL https://deno.land/install.sh | sh
    export PATH="$HOME/.deno/bin:$PATH"
fi

cd ../../offchain/lucid-evolution
echo "  Caching Lucid Evolution..."
deno cache --reload identity.ts did-resolver.ts || echo "  (Some warnings expected)"

cd ../meshjs
echo "  Caching MeshJS..."
deno cache --reload identity.ts did-resolver.ts || echo "  (Some warnings expected)"

cd ../..

echo ""
echo "=================================================="
echo "🎉 BUILD COMPLETE!"
echo "=================================================="
echo ""
echo "Generated files:"
echo "  ✅ onchain/aiken/plutus.json"
echo "  ✅ Deno dependencies cached"
echo ""
echo "Try it out:"
echo "  cd offchain/lucid-evolution"
echo "  deno run -A identity.ts"
echo ""
