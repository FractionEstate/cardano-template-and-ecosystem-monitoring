# 🔨 BUILD INSTRUCTIONS

## Current Status

The build environment is configured, but you need to run the build commands in your terminal.

## Quick Build (3 Steps)

### Step 1: Make build script executable

```bash
cd /workspaces/cardano-template-and-ecosystem-monitoring/decentralized-identity
chmod +x simple-build.sh
```

### Step 2: Run the build

```bash
./simple-build.sh
```

### Step 3: Verify

```bash
ls -lh onchain/aiken/plutus.json
```

## If Aiken is Not Installed

### Install Aiken

```bash
# Download and install
curl -sSfL https://install.aiken-lang.org | bash

# Add to PATH
export PATH="$HOME/.aiken/bin:$PATH"

# Verify installation
aiken --version
```

## Manual Build Steps

If the script doesn't work, run these commands manually:

```bash
# 1. Navigate to the Aiken directory
cd /workspaces/cardano-template-and-ecosystem-monitoring/decentralized-identity/onchain/aiken

# 2. Fetch dependencies
aiken packages fetch

# 3. Run tests (30+ tests should pass)
aiken check

# 4. Build contracts
aiken build

# 5. Verify output
ls -lh plutus.json
```

## Expected Output

When successful, you should see:

```
✓ Compiling aiken v1.1.17
✓ Running 30 tests...
  ✓ test_create_identity_success ... ok
  ✓ test_change_owner_success ... ok
  ✓ test_add_delegate_success ... ok
  ... (27 more tests)

✓ All tests passed!
✓ Building validators
✓ identity: ~3247 bytes
✓ identity_nft: ~1843 bytes

Generated: plutus.json
```

## Troubleshooting

### "aiken: command not found"

Solution: Install Aiken using the command above, then add to PATH

### "packages not found" error

Solution: Run `aiken packages fetch` first

### "permission denied"

Solution: Run `chmod +x simple-build.sh`

## Alternative: Use existing build script

```bash
cd /workspaces/cardano-template-and-ecosystem-monitoring/decentralized-identity
chmod +x build.sh
./build.sh
```

This will also install Aiken if it's not present.

## After Building

Once built successfully:

1. **Test the contracts**: `cd onchain/aiken && aiken check`
2. **Run discovery**: `cd ../../.. && bash scripts/local-test-discovery.sh`
3. **Try off-chain code**: `cd offchain/lucid-evolution && deno run -A identity.ts`

## Files Generated

After successful build:

- ✅ `onchain/aiken/plutus.json` (~5-6 KB)
- ✅ `onchain/aiken/build/` directory with artifacts

---

**Need Help?** See [QUICKSTART.md](./QUICKSTART.md) or [README.md](./README.md)
