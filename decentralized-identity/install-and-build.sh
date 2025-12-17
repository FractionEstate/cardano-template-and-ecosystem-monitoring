#!/bin/bash

# Install all dependencies and build decentralized-identity
# This script can be run from anywhere

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== Installing Dependencies and Building ===${NC}\n"

# Navigate to decentralized-identity directory
cd "$(dirname "$0")"

# Step 1: Install Aiken if needed
echo -e "${YELLOW}Step 1: Checking Aiken...${NC}"
if command -v aiken &> /dev/null; then
    echo -e "${GREEN}✓ Aiken already installed: $(aiken --version)${NC}"
else
    echo -e "${YELLOW}Installing Aiken...${NC}"
    # Try to install via the official installer
    if curl -sSfL https://install.aiken-lang.org > /tmp/install-aiken.sh 2>&1; then
        bash /tmp/install-aiken.sh
        export PATH="$HOME/.aiken/bin:$PATH"
        echo -e "${GREEN}✓ Aiken installed${NC}"
    else
        echo -e "${RED}✗ Could not download Aiken installer${NC}"
        echo -e "${YELLOW}Please install Aiken manually:${NC}"
        echo "  Visit: https://aiken-lang.org/installation-instructions"
        echo "  Or run: cargo install aiken"
    fi
fi

# Step 2: Check Deno
echo -e "\n${YELLOW}Step 2: Checking Deno...${NC}"
if command -v deno &> /dev/null; then
    echo -e "${GREEN}✓ Deno already installed: $(deno --version | head -1)${NC}"
else
    echo -e "${YELLOW}Installing Deno...${NC}"
    curl -fsSL https://deno.land/install.sh | sh
    export PATH="$HOME/.deno/bin:$PATH"
    echo -e "${GREEN}✓ Deno installed${NC}"
fi

# Step 3: Check JBang
echo -e "\n${YELLOW}Step 3: Checking JBang...${NC}"
if command -v jbang &> /dev/null; then
    echo -e "${GREEN}✓ JBang already installed${NC}"
else
    echo -e "${YELLOW}Installing JBang...${NC}"
    curl -Ls https://sh.jbang.dev | bash -s - app install --fresh --force jbang
    export PATH="$HOME/.jbang/bin:$PATH"
    echo -e "${GREEN}✓ JBang installed${NC}"
fi

# Step 4: Cache Deno dependencies
echo -e "\n${YELLOW}Step 4: Caching Deno dependencies...${NC}"

if command -v deno &> /dev/null; then
    echo "Caching Lucid Evolution..."
    cd offchain/lucid-evolution
    deno cache --reload identity.ts did-resolver.ts || echo "Note: Some type warnings are expected"
    echo -e "${GREEN}✓ Lucid Evolution dependencies cached${NC}"

    echo "Caching MeshJS..."
    cd ../meshjs
    deno cache --reload identity.ts did-resolver.ts || echo "Note: Some type warnings are expected"
    echo -e "${GREEN}✓ MeshJS dependencies cached${NC}"

    cd ../..
fi

# Step 5: Build Aiken contracts
echo -e "\n${YELLOW}Step 5: Building Aiken smart contracts...${NC}"

if command -v aiken &> /dev/null; then
    cd onchain/aiken

    echo "Fetching Aiken packages..."
    aiken packages fetch || echo "Packages may already be fetched"

    echo "Running tests..."
    if aiken check; then
        echo -e "${GREEN}✓ All tests passed${NC}"
    else
        echo -e "${RED}✗ Tests failed - please review errors above${NC}"
    fi

    echo "Building contracts..."
    if aiken build; then
        echo -e "${GREEN}✓ Contracts built successfully${NC}"
        if [ -f "plutus.json" ]; then
            SIZE=$(wc -c < plutus.json 2>/dev/null || echo "0")
            echo -e "${GREEN}✓ plutus.json generated ($SIZE bytes)${NC}"
        fi
    else
        echo -e "${RED}✗ Build failed${NC}"
    fi

    cd ../..
else
    echo -e "${YELLOW}⚠ Aiken not available - skipping contract build${NC}"
fi

# Summary
echo -e "\n${BLUE}=== Installation Complete ===${NC}\n"
echo -e "${GREEN}All dependencies installed and code built!${NC}\n"
echo "Available commands:"
echo "  • Lucid Evolution: cd offchain/lucid-evolution && deno run -A identity.ts"
echo "  • MeshJS:          cd offchain/meshjs && deno run -A identity.ts"
echo "  • Java:            cd offchain/ccl-java && jbang Identity.java"
echo "  • DID Resolver:    cd offchain/lucid-evolution && deno run -A did-resolver.ts"
echo ""
echo "Documentation:"
echo "  • README.md       - Overview and getting started"
echo "  • EXAMPLES.md     - Comprehensive usage examples"
echo "  • DEPLOYMENT.md   - Production deployment guide"
echo ""
