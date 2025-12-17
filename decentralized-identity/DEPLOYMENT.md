# 🚀 Decentralized Identity - Deployment Guide

This guide provides step-by-step instructions for deploying the Decentralized Identity system to Cardano networks (Preview, Preprod, and Mainnet).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Build Process](#build-process)
- [Testing](#testing)
- [Network Deployment](#network-deployment)
- [Verification](#verification)
- [Production Checklist](#production-checklist)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Aiken**: v1.1.17 or later
- **Deno**: v2.0 or later (for TypeScript implementations)
- **Java**: JDK 21+ with JBang (for Java implementation)
- **Cardano Node**: Access to Cardano node (local or remote)
- **Funds**: Test ADA for preview/preprod, real ADA for mainnet

### Development Tools

```bash
# Install Aiken
curl -sSf https://install.aiken-lang.org | bash

# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Install JBang
curl -Ls https://sh.jbang.dev | bash -s - app install --fresh --force jbang
```

### Environment Setup

```bash
# Set network (preview, preprod, or mainnet)
export CARDANO_NETWORK=preprod

# Set Blockfrost API key (recommended)
export BLOCKFROST_PROJECT_ID=your_project_id_here

# Or set custom node endpoint
export CARDANO_NODE_API=https://your-node-url
```

---

## Build Process

### 1. Build On-Chain Contracts

```bash
cd decentralized-identity/onchain/aiken

# Check syntax and run tests
aiken check

# Build optimized Plutus scripts
aiken build

# View build artifacts
ls -la plutus.json
```

**Expected Output:**

```
✓ Compiling aiken v1.1.17
✓ Building validators
✓ identity: 3247 bytes
✓ identity_nft: 1843 bytes
✓ Running 30 tests...
  ✓ test_create_identity_success ... ok
  ✓ test_change_owner_success ... ok
  ✓ test_add_delegate_success ... ok
  ... (27 more tests)

✓ All tests passed!

Generated: plutus.json (5.2 KB)
```

### 2. Verify Contract Size

Cardano has script size limits. Verify your contracts are within bounds:

```bash
# Check compiled script sizes
aiken blueprint policy identity_nft | jq '.compiledCode' | wc -c
aiken blueprint validator identity | jq '.compiledCode' | wc -c
```

**Limits:**

- **PlutusV2**: 16,384 bytes per script
- **PlutusV3**: 32,768 bytes per script (used in this implementation)

Our contracts:

- `identity.ak`: ~3,247 bytes ✅
- `identity_nft.ak`: ~1,843 bytes ✅

### 3. Generate Script Addresses

```bash
# Generate identity validator address
aiken blueprint address identity --network-tag preprod

# Generate NFT minting policy hash
aiken blueprint policy identity_nft
```

**Sample Output:**

```
Identity Validator Address (Preprod):
addr_test1wpx7j8qz2w3n4m5k6h7g8f9d0s1a2p3o4i5u6y7t8r9e0w

Identity NFT Policy ID:
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8
```

**Save these values** - you'll need them for off-chain configuration.

---

## Testing

### 1. On-Chain Unit Tests

```bash
cd decentralized-identity/onchain/aiken

# Run full test suite
aiken check

# Run specific test
aiken check -m identity_test::test_add_delegate_success
```

### 2. Off-Chain Integration Tests

#### Lucid Evolution

```bash
cd decentralized-identity/offchain/lucid-evolution

# Run identity service tests
deno test -A identity.ts

# Run DID resolver tests
deno test -A did-resolver.ts
```

#### MeshJS

```bash
cd decentralized-identity/offchain/meshjs

# Run tests
deno test -A identity.ts
deno test -A did-resolver.ts
```

#### Java

```bash
cd decentralized-identity/offchain/ccl-java

# Run Java tests
jbang test Identity.java
jbang test DIDResolver.java
```

### 3. End-to-End Testing on Preview

```bash
# Set preview network
export CARDANO_NETWORK=preview
export BLOCKFROST_PROJECT_ID=preview_your_key

# Run full lifecycle test
cd offchain/lucid-evolution
deno run -A identity.ts create
deno run -A identity.ts change-owner <policy_id> <new_owner>
deno run -A identity.ts add-delegate <policy_id> sigAuth <delegate> 30
deno run -A identity.ts set-attribute <policy_id> "did/svc/email" "test@example.com" 365
deno run -A did-resolver.ts generate <policy_id> preview
```

**Expected Flow:**

1. ✅ Identity created with NFT
2. ✅ Owner changed to new address
3. ✅ Delegate added with 30-day validity
4. ✅ Attribute set with 365-day validity
5. ✅ DID Document resolved correctly

---

## Network Deployment

### Preview Network (Testing)

**Purpose**: Rapid iteration and testing
**Network ID**: 0
**Faucet**: https://docs.cardano.org/cardano-testnet/tools/faucet/

```bash
# Set preview network
export CARDANO_NETWORK=preview
export BLOCKFROST_PROJECT_ID=preview_your_api_key

# Get test ADA
curl -X POST https://faucet.preview.world.dev.cardano.org/send-money/addr_test1...

# Deploy and test
cd offchain/lucid-evolution
deno run -A identity.ts create
```

### Preprod Network (Pre-Production)

**Purpose**: Final testing before mainnet
**Network ID**: 1
**Faucet**: https://docs.cardano.org/cardano-testnet/tools/faucet/

```bash
# Set preprod network
export CARDANO_NETWORK=preprod
export BLOCKFROST_PROJECT_ID=preprod_your_api_key

# Get test ADA
curl -X POST https://faucet.preprod.world.dev.cardano.org/send-money/addr_test1...

# Run production-like tests
cd offchain/lucid-evolution
deno run -A identity.ts create
deno run -A identity.ts add-delegate <policy_id> sigAuth <delegate> 90
```

**Preprod Checklist:**

- [ ] Test all identity operations
- [ ] Test with multiple wallets
- [ ] Verify delegate expiration
- [ ] Test attribute management
- [ ] Verify DID resolution
- [ ] Monitor transaction costs
- [ ] Test error scenarios
- [ ] Load testing (multiple identities)

### Mainnet Deployment (Production)

**Purpose**: Production deployment
**Network ID**: 1
**⚠️ REAL ADA REQUIRED**

#### Pre-Deployment Checklist

- [ ] All tests pass on preprod
- [ ] Security audit completed
- [ ] Documentation reviewed
- [ ] Monitoring setup ready
- [ ] Backup and recovery plan
- [ ] Emergency response plan
- [ ] Legal compliance verified
- [ ] User documentation complete

#### Deployment Steps

```bash
# Set mainnet network
export CARDANO_NETWORK=mainnet
export BLOCKFROST_PROJECT_ID=mainnet_your_api_key

# Build for mainnet
cd onchain/aiken
aiken build

# Generate mainnet addresses
aiken blueprint address identity --network-tag mainnet
aiken blueprint policy identity_nft

# Record addresses in deployment log
echo "Deployment Date: $(date)" > DEPLOYMENT_LOG.md
echo "Identity Address: $(aiken blueprint address identity --network-tag mainnet)" >> DEPLOYMENT_LOG.md
echo "NFT Policy: $(aiken blueprint policy identity_nft)" >> DEPLOYMENT_LOG.md
```

#### Initial Mainnet Test

```bash
# Create test identity with minimal ADA
cd offchain/lucid-evolution
deno run -A identity.ts create

# Verify on explorer
echo "Check tx: https://cardanoscan.io/transaction/<tx_hash>"

# Test basic operations
deno run -A identity.ts add-delegate <policy_id> sigAuth <delegate> 30
deno run -A identity.ts set-attribute <policy_id> "test" "value" 1

# Verify DID resolution
deno run -A did-resolver.ts generate <policy_id> mainnet
```

#### Production Configuration

Create `production.env`:

```bash
# Network
CARDANO_NETWORK=mainnet

# API Access
BLOCKFROST_PROJECT_ID=mainnet_your_secure_api_key

# Security
ENABLE_RATE_LIMITING=true
MAX_REQUESTS_PER_MINUTE=60

# Monitoring
SENTRY_DSN=https://your-sentry-dsn
LOG_LEVEL=info

# Backup
ENABLE_DATUM_BACKUP=true
BACKUP_INTERVAL_HOURS=24
```

---

## Verification

### 1. Contract Verification

Verify deployed contracts match your build:

```bash
# Compare on-chain script with local build
cd onchain/aiken

# Get on-chain script
curl "https://cardano-mainnet.blockfrost.io/api/v0/scripts/<script_hash>" \
  -H "project_id: $BLOCKFROST_PROJECT_ID" > deployed.json

# Extract compiled code from blueprint
jq '.compiledCode' plutus.json > local.json

# Compare
diff deployed.json local.json
```

### 2. Transaction Verification

Monitor and verify transactions:

```bash
# View transaction details
curl "https://cardano-mainnet.blockfrost.io/api/v0/txs/<tx_hash>" \
  -H "project_id: $BLOCKFROST_PROJECT_ID" | jq .

# View UTXOs at identity address
curl "https://cardano-mainnet.blockfrost.io/api/v0/addresses/<identity_address>/utxos" \
  -H "project_id: $BLOCKFROST_PROJECT_ID" | jq .
```

### 3. DID Resolution Verification

```bash
# Resolve DID and verify structure
cd offchain/lucid-evolution
deno run -A did-resolver.ts generate <policy_id> mainnet > did.json

# Validate against W3C DID Core spec
curl -X POST https://validator.w3.org/nu/?out=json \
  -H "Content-Type: application/json" \
  -d @did.json
```

---

## Production Checklist

### Security

- [ ] Private keys stored in hardware wallets or HSM
- [ ] API keys stored in secure vault (e.g., HashiCorp Vault)
- [ ] Rate limiting enabled on all endpoints
- [ ] Input validation on all user inputs
- [ ] HTTPS enforced for all connections
- [ ] Regular security audits scheduled
- [ ] Incident response plan documented

### Performance

- [ ] Connection pooling configured
- [ ] Caching strategy implemented
- [ ] CDN setup for static assets
- [ ] Database indexes optimized
- [ ] Query performance tested
- [ ] Load balancing configured
- [ ] Auto-scaling rules defined

### Monitoring

- [ ] Application metrics tracked (Prometheus)
- [ ] Error tracking enabled (Sentry)
- [ ] Log aggregation setup (ELK Stack)
- [ ] Uptime monitoring active (UptimeRobot)
- [ ] Alert rules configured (PagerDuty)
- [ ] Dashboard created (Grafana)
- [ ] Transaction monitoring active

### Compliance

- [ ] GDPR compliance verified (if applicable)
- [ ] Data retention policy defined
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Cookie policy implemented
- [ ] Accessibility standards met (WCAG 2.1)
- [ ] Legal review completed

### Documentation

- [ ] API documentation complete
- [ ] Integration guides published
- [ ] Example code provided
- [ ] Troubleshooting guide available
- [ ] FAQ section created
- [ ] Video tutorials recorded
- [ ] Change log maintained

---

## Monitoring

### Key Metrics to Track

**On-Chain Metrics:**

- Transaction success rate
- Average transaction fees
- Contract execution costs
- Script size and efficiency
- UTXO count at identity address

**Off-Chain Metrics:**

- API response times
- DID resolution latency
- Error rates by operation type
- Wallet connection success rate
- User activity patterns

### Prometheus Metrics Example

```typescript
// Example metrics in TypeScript
import { Counter, Histogram } from 'prom-client';

const identityCreations = new Counter({
  name: 'identity_creations_total',
  help: 'Total number of identities created',
});

const transactionDuration = new Histogram({
  name: 'transaction_duration_seconds',
  help: 'Transaction execution duration',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

const didResolutions = new Counter({
  name: 'did_resolutions_total',
  help: 'Total DID resolutions',
  labelNames: ['network', 'status'],
});
```

### Grafana Dashboard

Create dashboard with panels for:

1. **Transaction Volume** (line chart)
2. **Success Rate** (gauge)
3. **Average Fees** (stat)
4. **Error Rate** (alert panel)
5. **DID Resolutions** (counter)
6. **Active Identities** (stat)

---

## Troubleshooting

### Common Issues

#### 1. Transaction Fails with "UTxOBalanceInsufficientError"

**Cause**: Not enough ADA in wallet
**Solution**:

```bash
# Check wallet balance
cardano-cli query utxo --address <wallet_address>

# Send more ADA to wallet
# Minimum: 5 ADA for operations + transaction fees
```

#### 2. "Script evaluation failed"

**Cause**: Invalid datum or redeemer
**Solution**:

```bash
# Enable debug mode
export DEBUG=true

# Check datum structure
cd offchain/lucid-evolution
deno run -A identity.ts validate-datum <policy_id>

# Verify against on-chain tests
cd onchain/aiken
aiken check -m identity_test::test_add_delegate_success
```

#### 3. "Network connection timeout"

**Cause**: Blockfrost API issues or rate limiting
**Solution**:

```bash
# Check API status
curl "https://status.blockfrost.io"

# Verify API key
echo $BLOCKFROST_PROJECT_ID

# Use fallback provider
export CARDANO_NODE_API=https://cardano-mainnet.blockfrost.io/api/v0
```

#### 4. DID Resolution Returns Empty

**Cause**: Identity UTXO not found or spent
**Solution**:

```bash
# Check if UTXO exists
cd offchain/lucid-evolution
deno run -A identity.ts query <policy_id>

# Verify NFT is at expected address
# Check on Cardano explorer
```

#### 5. Delegate Already Exists Error

**Cause**: Attempting to add duplicate delegate
**Solution**:

```bash
# Check existing delegates
deno run -A did-resolver.ts generate <policy_id>

# Revoke existing delegate first
deno run -A identity.ts revoke-delegate <policy_id> <type> <delegate>

# Then add new delegate
deno run -A identity.ts add-delegate <policy_id> <type> <delegate> <validity>
```

### Debug Mode

Enable detailed logging:

```bash
# Lucid Evolution
export LUCID_DEBUG=true
deno run -A identity.ts create

# MeshJS
export MESH_DEBUG=true
deno run -A identity.ts create

# Java
export JAVA_OPTS="-Dlog.level=DEBUG"
jbang Identity.java create
```

### Support Channels

- **GitHub Issues**: https://github.com/your-repo/issues
- **Discord**: https://discord.gg/your-server
- **Email**: support@your-domain.com
- **Documentation**: https://docs.your-domain.com

---

## Rollback Procedure

If critical issues are discovered post-deployment:

### 1. Immediate Response

```bash
# Disable new identity creation (via rate limiting)
curl -X POST https://your-api.com/admin/disable-creation \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Monitor existing identities
cd monitoring/
./check-all-identities.sh
```

### 2. Investigation

```bash
# Collect logs
./scripts/collect-logs.sh > incident-$(date +%Y%m%d-%H%M%S).log

# Analyze transactions
./scripts/analyze-failed-txs.sh
```

### 3. Communication

- Update status page
- Notify users via email
- Post incident report
- Provide timeline for resolution

### 4. Recovery

```bash
# Deploy hotfix if needed
cd onchain/aiken
# Apply fix to validator
aiken build

# Update off-chain code
cd offchain/lucid-evolution
# Apply fix
deno cache --reload identity.ts

# Re-enable services
curl -X POST https://your-api.com/admin/enable-creation \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Post-Deployment

### Week 1

- [ ] Monitor all metrics 24/7
- [ ] Review error logs daily
- [ ] Check transaction success rates
- [ ] Verify DID resolutions working
- [ ] Respond to user feedback

### Week 2-4

- [ ] Analyze usage patterns
- [ ] Optimize based on metrics
- [ ] Update documentation based on issues
- [ ] Plan feature enhancements
- [ ] Conduct performance review

### Monthly

- [ ] Security audit
- [ ] Performance review
- [ ] User feedback analysis
- [ ] Dependency updates
- [ ] Cost optimization review

---

## Resources

- **Cardano Explorer (Mainnet)**: https://cardanoscan.io
- **Cardano Explorer (Preprod)**: https://preprod.cardanoscan.io
- **Blockfrost API**: https://blockfrost.io
- **Aiken Documentation**: https://aiken-lang.org
- **Cardano Developer Portal**: https://developers.cardano.org

---

## Contact

For deployment support or questions:

- **Technical Support**: tech@your-domain.com
- **Security Issues**: security@your-domain.com
- **General Inquiries**: info@your-domain.com

---

_Last Updated: $(date)_
