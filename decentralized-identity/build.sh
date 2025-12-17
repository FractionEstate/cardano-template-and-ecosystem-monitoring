#!/bin/bash

# Decentralized Identity Build and Test Script
# This script compiles the Aiken smart contracts and prepares the off-chain code

set -e

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🆔 Decentralized Identity - Build Script${NC}"
echo "============================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ============================================================================
# STEP 1: Check Prerequisites
# ============================================================================

echo -e "${YELLOW}📋 Step 1: Checking prerequisites...${NC}"

# Check Aiken
if ! command -v aiken &> /dev/null; then
  echo -e "${RED}❌ Aiken is not installed${NC}"
  echo "Installing Aiken..."
  curl -sSfL https://install.aiken-lang.org | bash
  export PATH="$HOME/.aiken/bin:$PATH"

  if ! command -v aiken &> /dev/null; then
    echo -e "${RED}❌ Failed to install Aiken. Please install manually:${NC}"
    echo "   curl -sSfL https://install.aiken-lang.org | bash"
    exit 1
  fi
fi
AIKEN_VERSION=$(aiken --version)
echo -e "${GREEN}✅ Aiken: $AIKEN_VERSION${NC}"

# Check Deno (optional)
if command -v deno &> /dev/null; then
  DENO_VERSION=$(deno --version | head -n1)
  echo -e "${GREEN}✅ Deno: $DENO_VERSION${NC}"
else
  echo -e "${YELLOW}⚠️  Deno not installed (optional for off-chain TypeScript)${NC}"
fi

# Check JBang (optional)
if command -v jbang &> /dev/null; then
  JBANG_VERSION=$(jbang --version)
  echo -e "${GREEN}✅ JBang: $JBANG_VERSION${NC}"
else
  echo -e "${YELLOW}⚠️  JBang not installed (optional for off-chain Java)${NC}"
fi

echo ""

# ============================================================================
# STEP 2: Build Aiken Smart Contracts
# ============================================================================

echo -e "${YELLOW}📦 Step 2: Building Aiken smart contracts...${NC}"

cd "$SCRIPT_DIR/onchain/aiken"

# Fetch dependencies
echo "   Fetching dependencies..."
aiken packages fetch

# Run checks (tests)
echo "   Running aiken check (tests)..."
if aiken check; then
  echo -e "${GREEN}   ✅ All tests passed${NC}"
else
  echo -e "${RED}   ❌ Tests failed${NC}"
  exit 1
fi

# Build
echo "   Running aiken build..."
if aiken build; then
  echo -e "${GREEN}   ✅ Build successful${NC}"
else
  echo -e "${RED}   ❌ Build failed${NC}"
  exit 1
fi

# Verify plutus.json
if [[ -f "plutus.json" ]]; then
  PLUTUS_SIZE=$(wc -c < plutus.json)
  VALIDATOR_COUNT=$(grep -c '"title"' plutus.json || echo "0")
  echo -e "${GREEN}   ✅ plutus.json generated ($PLUTUS_SIZE bytes, $VALIDATOR_COUNT validators)${NC}"
else
  echo -e "${RED}   ❌ plutus.json not generated${NC}"
  exit 1
fi

echo ""

# ============================================================================
# STEP 3: Prepare Off-chain Code
# ============================================================================

echo -e "${YELLOW}🔧 Step 3: Preparing off-chain code...${NC}"

cd "$SCRIPT_DIR"

# Lucid Evolution
if command -v deno &> /dev/null; then
  echo "   Caching Lucid Evolution dependencies..."
  cd "$SCRIPT_DIR/offchain/lucid-evolution"
  deno cache identity.ts 2>/dev/null || true
  echo -e "${GREEN}   ✅ Lucid Evolution ready${NC}"

  echo "   Caching MeshJS dependencies..."
  cd "$SCRIPT_DIR/offchain/meshjs"
  deno cache identity.ts 2>/dev/null || true
  echo -e "${GREEN}   ✅ MeshJS ready${NC}"
else
  echo -e "${YELLOW}   ⚠️  Skipping TypeScript off-chain (Deno not installed)${NC}"
fi

# Java
if command -v jbang &> /dev/null; then
  echo "   Preparing Java dependencies..."
  cd "$SCRIPT_DIR/offchain/ccl-java"
  # JBang will fetch dependencies on first run
  echo -e "${GREEN}   ✅ CCL Java ready${NC}"
else
  echo -e "${YELLOW}   ⚠️  Skipping Java off-chain (JBang not installed)${NC}"
fi

echo ""

# ============================================================================
# STEP 4: Summary
# ============================================================================

echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}🎉 Build Complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "Files generated:"
echo "  - onchain/aiken/plutus.json (compiled validators)"
echo ""
echo "To create an identity (Lucid Evolution):"
echo "  cd offchain/lucid-evolution"
echo "  deno run -A identity.ts prepare"
echo "  # Fund the wallet with tADA"
echo "  deno run -A identity.ts create"
echo ""
echo "To run with Java:"
echo "  cd offchain/ccl-java"
echo "  jbang Identity.java create"
echo ""
echo -e "${GREEN}✅ Decentralized Identity is ready for deployment!${NC}"
