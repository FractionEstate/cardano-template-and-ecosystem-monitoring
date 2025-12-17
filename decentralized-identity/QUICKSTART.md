# 🚀 Quick Start Guide - Decentralized Identity

Get up and running with the Decentralized Identity system in minutes!

## Prerequisites

- **Linux/macOS**: This guide assumes a Unix-like environment
- **Internet connection**: Required to download dependencies
- **5+ GB free disk space**: For tools and dependencies

## One-Command Installation

From the `decentralized-identity` directory:

```bash
chmod +x install-and-build.sh && ./install-and-build.sh
```

This script will:

1. ✅ Install Aiken (smart contract compiler)
2. ✅ Install Deno (TypeScript runtime)
3. ✅ Install JBang (Java runner)
4. ✅ Download all dependencies
5. ✅ Build and test all contracts
6. ✅ Verify everything works

**Estimated time**: 3-5 minutes

---

## Manual Installation (If Needed)

### Step 1: Install Aiken

```bash
curl -sSfL https://install.aiken-lang.org | bash
export PATH="$HOME/.aiken/bin:$PATH"
```

Verify:

```bash
aiken --version
```

### Step 2: Install Deno

```bash
curl -fsSL https://deno.land/install.sh | sh
export PATH="$HOME/.deno/bin:$PATH"
```

Verify:

```bash
deno --version
```

### Step 3: Install JBang (for Java)

```bash
curl -Ls https://sh.jbang.dev | bash -s - app install --fresh --force jbang
export PATH="$HOME/.jbang/bin:$PATH"
```

Verify:

```bash
jbang --version
```

### Step 4: Build the Project

```bash
cd decentralized-identity
chmod +x build.sh
./build.sh
```

---

## First Steps After Installation

### 1. Test the Build

```bash
# Check Aiken contracts
cd onchain/aiken
aiken check  # Should show 30+ tests passing
```

### 2. Run Your First Identity Operation

**Using Lucid Evolution (TypeScript):**

```bash
cd offchain/lucid-evolution
deno run -A identity.ts

# Follow the interactive prompts to:
# - Choose network (preview/preprod)
# - Create identity
# - Manage delegates
# - Set attributes
```

**Using MeshJS (TypeScript):**

```bash
cd offchain/meshjs
deno run -A identity.ts
```

**Using Java:**

```bash
cd offchain/ccl-java
jbang Identity.java
```

### 3. Resolve a DID Document

```bash
cd offchain/lucid-evolution

# Generate a DID Document for an identity
deno run -A did-resolver.ts generate <policy_id> [network]

# Example:
deno run -A did-resolver.ts generate a1b2c3d4e5f6... preprod
```

---

## Quick Reference

### Common Commands

```bash
# Build everything
./build.sh

# Run Aiken tests
cd onchain/aiken && aiken check

# Cache Deno dependencies
cd offchain/lucid-evolution && deno cache --reload identity.ts did-resolver.ts

# Create identity (Lucid)
cd offchain/lucid-evolution && deno run -A identity.ts create

# Resolve DID
cd offchain/lucid-evolution && deno run -A did-resolver.ts generate <policy_id>
```

### Project Structure

```
decentralized-identity/
├── onchain/aiken/              # Smart contracts
│   ├── validators/
│   │   ├── identity.ak         # Main validator
│   │   └── identity_nft.ak     # NFT minting policy
│   └── plutus.json             # Compiled contracts (generated)
│
├── offchain/
│   ├── lucid-evolution/        # TypeScript (Lucid)
│   │   ├── identity.ts         # Identity operations
│   │   └── did-resolver.ts     # DID resolution
│   ├── meshjs/                 # TypeScript (MeshJS)
│   │   ├── identity.ts
│   │   └── did-resolver.ts
│   └── ccl-java/               # Java implementation
│       ├── Identity.java
│       └── DIDResolver.java
│
├── README.md                   # Full documentation
├── EXAMPLES.md                 # Usage examples
├── DEPLOYMENT.md               # Production deployment
└── QUICKSTART.md               # This file
```

---

## Troubleshooting

### "Aiken not found"

Add Aiken to your PATH:

```bash
export PATH="$HOME/.aiken/bin:$PATH"
# Add to ~/.bashrc or ~/.zshrc for persistence
echo 'export PATH="$HOME/.aiken/bin:$PATH"' >> ~/.bashrc
```

### "Cannot find module" errors in VS Code

These are expected! Deno resolves modules at runtime. To fix VS Code errors:

1. Install Deno VS Code extension: `code --install-extension denoland.vscode-deno`
2. The `.vscode/settings.json` is already configured

### "Insufficient funds" error

Get test ADA from faucets:

- **Preview**: https://docs.cardano.org/cardano-testnet/tools/faucet/
- **Preprod**: https://docs.cardano.org/cardano-testnet/tools/faucet/

Minimum required: **5 ADA** for operations + transaction fees

### Build fails with "packages not found"

```bash
cd onchain/aiken
aiken packages fetch
aiken build
```

---

## What's Next?

### 📚 Learn More

1. **Read the full README**: `cat README.md`
2. **See usage examples**: `cat EXAMPLES.md`
3. **Learn about deployment**: `cat DEPLOYMENT.md`
4. **Review implementation details**: `cat IMPLEMENTATION_PLAN.md`

### 🛠️ Try These Examples

1. **Create an identity**:

   ```bash
   cd offchain/lucid-evolution
   deno run -A identity.ts create
   ```

2. **Add a delegate**:

   ```bash
   deno run -A identity.ts add-delegate <policy_id> sigAuth <delegate_pkh> 30
   ```

3. **Set an attribute**:

   ```bash
   deno run -A identity.ts set-attribute <policy_id> "did/svc/email" "alice@example.com" 365
   ```

4. **Resolve DID Document**:
   ```bash
   deno run -A did-resolver.ts generate <policy_id> preprod
   ```

### 🚀 Deploy to Production

When you're ready to deploy to mainnet:

1. Review the [Deployment Guide](./DEPLOYMENT.md)
2. Complete the pre-production checklist
3. Test thoroughly on preprod testnet
4. Deploy to mainnet with real ADA

---

## Getting Help

- **Documentation**: Start with [README.md](./README.md)
- **Examples**: See [EXAMPLES.md](./EXAMPLES.md)
- **Deployment**: Read [DEPLOYMENT.md](./DEPLOYMENT.md)
- **GitHub Issues**: Report bugs or request features
- **Cardano Stack Exchange**: Ask technical questions

---

## Success Criteria

✅ You're ready to proceed if:

- [ ] `aiken check` shows all tests passing
- [ ] `aiken build` generates `plutus.json`
- [ ] `deno run -A identity.ts` shows help/usage
- [ ] No "command not found" errors

If all checks pass, you have a working development environment!

---

**Time to build**: ~5 minutes
**Next**: Create your first identity and explore the examples!

Happy building! 🎉
