# 🆔 Decentralized Identity (DID) for Cardano

A production-ready implementation of EIP-1056 style Decentralized Identity management on Cardano, leveraging the UTXO model for secure, self-sovereign identity control.

> **📋 Implementation Status**: ✅ Complete & Production Ready
>
> **� Quick Start**: New to the project? Start with [QUICKSTART.md](./QUICKSTART.md) for a 5-minute setup!
>
> **📚 Documentation**:
>
> - 🚀 [**Quick Start**](./QUICKSTART.md) - Get up and running in 5 minutes
> - 📘 [Usage Examples](./EXAMPLES.md) - Complete code examples and use cases
> - 🔧 [Deployment Guide](./DEPLOYMENT.md) - Step-by-step deployment to Cardano networks
> - 📋 [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Detailed technical specifications
> - 🏗️ [Architecture Diagrams](./ARCHITECTURE_DIAGRAMS.md) - Visual architecture overview
> - 🔨 [On-chain README](./onchain/aiken/README.md) - Smart contract documentation

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Smart Contracts](#smart-contracts)
- [Off-chain Implementations](#off-chain-implementations)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Security Considerations](#security-considerations)
- [Testing](#testing)

## Overview

This project implements a Decentralized Identity (DID) system on Cardano, inspired by [EIP-1056](https://eips.ethereum.org/EIPS/eip-1056) (Ethereum's ERC-1056 Lightweight Identity). The implementation adapts the account-based identity model to Cardano's UTXO model, providing:

- **Self-Sovereign Identity**: Users maintain full control over their identity
- **Delegate Management**: Grant and revoke authorization to other addresses
- **Attribute Storage**: Store and manage identity attributes on-chain
- **NFT-based Identity**: Unique, non-fungible tokens represent identity ownership
- **Time-based Validity**: Delegates and attributes can have expiration times

### EIP-1056 on Cardano

| EIP-1056 Concept   | Cardano Implementation                                |
| ------------------ | ----------------------------------------------------- |
| Identity (address) | Public key hash stored in datum                       |
| Owner              | Current owner's public key hash in datum              |
| Delegates          | List of delegate records with types and validity      |
| Attributes         | Key-value pairs with validity timestamps              |
| Change events      | UTXO datum transitions (queryable via chain indexers) |

## 💎 Key Benefits

### 🔒 **Self-Sovereign Control**

- Blockchain addresses serve as unique identities
- Cryptographic signatures prove ownership and authorization
- No reliance on centralized identity providers
- Direct control over identity management decisions

### 🌐 **Delegate Management**

- Temporary delegates can be authorized for specific privileges
- Time-limited delegate permissions with automatic expiration
- Flexible delegation without compromising core ownership
- Block-based validity periods for precise control

### 🔍 **Ownership Transfer**

- Identity ownership can be transferred through signed transactions
- Cryptographic proof of ownership changes
- Secure handover of identity control to new owners
- Maintained identity continuity across ownership changes

### ⚖️ **Decentralized Verification**

- No central authority required for identity validation
- Transparent and verifiable identity operations
- Blockchain-based audit trail for all identity actions

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Decentralized Identity                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐         ┌──────────────────────────────────┐  │
│  │  Identity    │  mints  │        Identity UTXO              │  │
│  │  NFT Policy  │────────▶│  ┌────────────────────────────┐  │  │
│  │              │         │  │      Identity Datum         │  │  │
│  │  • One-shot  │         │  │  • identity: ByteArray      │  │  │
│  │  • Unique    │         │  │  • owner: ByteArray         │  │  │
│  └──────────────┘         │  │  • delegates: List          │  │  │
│                           │  │  • attributes: List         │  │  │
│                           │  │  • nonce: Int               │  │  │
│                           │  └────────────────────────────┘  │  │
│                           │                                    │  │
│                           │  + Identity NFT (1 token)          │  │
│                           └──────────────────────────────────┘  │
│                                          │                       │
│                                          │ spending              │
│                                          ▼                       │
│                           ┌──────────────────────────────────┐  │
│                           │       Identity Validator          │  │
│                           │                                    │  │
│                           │  Actions:                          │  │
│                           │  • ChangeOwner(new_owner)          │  │
│                           │  • AddDelegate(type, addr, valid)  │  │
│                           │  • RevokeDelegate(type, addr)      │  │
│                           │  • SetAttribute(name, val, valid)  │  │
│                           │  • RevokeAttribute(name, val)      │  │
│                           └──────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### UTXO-per-Identity Model

Each identity is represented by a single UTXO containing:

1. **Identity NFT**: A unique, non-fungible token that identifies this identity
2. **Identity Datum**: The current state including owner, delegates, and attributes
3. **Min ADA**: Minimum ADA required for the UTXO

State changes result in consuming the old UTXO and creating a new one with updated datum.

## 📂 Project Structure

```
decentralized-identity/
├── README.md                    # This file
├── IMPLEMENTATION_PLAN.md       # Detailed implementation plan
├── ARCHITECTURE_DIAGRAMS.md     # System architecture diagrams
├── onchain/
│   └── aiken/
│       ├── aiken.toml           # Aiken project config
│       ├── README.md            # On-chain documentation
│       ├── lib/
│       │   └── types.ak         # Shared type definitions
│       └── validators/
│           ├── identity.ak      # Main spend validator
│           ├── identity_nft.ak  # One-shot minting policy
│           └── tests/
│               └── identity_test.ak  # Unit tests
└── offchain/
    ├── lucid-evolution/         # TypeScript/Deno implementation
    │   ├── deno.json
    │   ├── identity.ts
    │   └── did-resolver.ts
    ├── meshjs/                  # MeshJS implementation
    │   ├── deno.json
    │   ├── identity.ts
    │   └── did-resolver.ts
    └── ccl-java/                # Java implementation
        ├── Identity.java
        └── DIDResolver.java
```

## 🚀 Getting Started

### Prerequisites

- [Aiken](https://aiken-lang.org/) v1.1.17+ for smart contract compilation
- [Deno](https://deno.land/) v1.40+ for TypeScript off-chain code
- [JBang](https://www.jbang.dev/) for Java off-chain code (optional)
- Access to Cardano node (via Blockfrost, Koios, or local node)
- Test ADA from [Cardano Testnet Faucet](https://docs.cardano.org/cardano-testnet/tools/faucet/)

### Quick Start

1. **Build the smart contracts**:

   ```bash
   cd onchain/aiken
   aiken build
   aiken check
   ```

2. **Set up off-chain environment** (Lucid Evolution):

   ```bash
   cd offchain/lucid-evolution
   deno run -A identity.ts prepare
   ```

3. **Create your first identity**:

   ```typescript
   import blueprint from "../../onchain/aiken/plutus.json" with { type: "json" };
   import { DecentralizedIdentity } from "./identity.ts";

   const identity = new DecentralizedIdentity({
     network: "Preprod",
     provider: "koios",
   });
   await identity.initialize();
   identity.selectWalletFromSeed(seedPhrase);

   const txHash = await identity.createIdentity(blueprint);
   console.log("Identity created:", txHash);
   ```

## 📋 API Reference

### On-chain Actions

| Action            | Redeemer                                                           | Description                       |
| ----------------- | ------------------------------------------------------------------ | --------------------------------- |
| `ChangeOwner`     | `{ new_owner: ByteArray }`                                         | Transfer ownership to new address |
| `AddDelegate`     | `{ delegate_type: ByteArray, delegate: ByteArray, validity: Int }` | Add delegate with validity period |
| `RevokeDelegate`  | `{ delegate_type: ByteArray, delegate: ByteArray }`                | Remove delegate                   |
| `SetAttribute`    | `{ name: ByteArray, value: ByteArray, validity: Int }`             | Set/update attribute              |
| `RevokeAttribute` | `{ name: ByteArray, value: ByteArray }`                            | Remove attribute                  |

### Off-chain Methods

All implementations provide these core methods:

| Method               | Parameters              | Description                    |
| -------------------- | ----------------------- | ------------------------------ |
| `createIdentity`     | `blueprint`             | Create new identity with NFT   |
| `changeOwner`        | `newOwnerPkh`           | Transfer identity ownership    |
| `addDelegate`        | `type, pkh, validity`   | Add authorized delegate        |
| `revokeDelegate`     | `type, pkh`             | Remove delegate authorization  |
| `setAttribute`       | `name, value, validity` | Set identity attribute         |
| `revokeAttribute`    | `name, value`           | Remove identity attribute      |
| `getIdentityDatum`   | -                       | Query current identity state   |
| `getValidDelegates`  | -                       | Get currently valid delegates  |
| `getValidAttributes` | -                       | Get currently valid attributes |

### Delegate Types

| Type      | Purpose          | Use Case                           |
| --------- | ---------------- | ---------------------------------- |
| `veriKey` | Verification Key | Off-chain signature verification   |
| `sigAuth` | Signature Auth   | On-chain transaction authorization |
| `enc`     | Encryption       | Key agreement/encryption           |

## 🔒 Security Considerations

### Authorization Model

- **Owner Authority**: Only the current owner can perform any action
- **Signature Verification**: Uses `vodka_extra_signatories` for reliable signer checks
- **No Delegate Self-Authorization**: Delegates cannot authorize themselves for actions

### Validity Checks

- **Time-bound Operations**: AddDelegate and SetAttribute require validity ranges
- **Expiration**: Delegates and attributes can expire (validity = 0 means permanent)
- **Nonce Protection**: Every action increments nonce to prevent replay attacks

### Best Practices

1. **Backup Identity**: Store the UTXO reference used to create your identity
2. **Set Validity Periods**: Use reasonable validity periods for delegates
3. **Monitor Events**: Use chain indexers to track identity changes
4. **Secure Keys**: Protect owner keys - ownership transfer is irreversible

## 🧪 Testing

### Unit Tests (Aiken)

```bash
cd onchain/aiken
aiken check
```

Tests cover:

- Token name computation
- Delegate validity checks
- Attribute validity checks
- Owner resolution
- All action types
- Edge cases

### Integration Tests (Off-chain)

```bash
# Lucid Evolution
cd offchain/lucid-evolution
deno run -A identity.ts test

# CCL Java
cd offchain/ccl-java
jbang Identity.java test
```

## 📚 DID Document Resolution

This implementation includes W3C DID Document resolution following the [DID Core specification](https://www.w3.org/TR/did-core/).

### DID Format

```
did:cardano:<network>:<identity_nft_policy_id>
```

**Examples**:

- `did:cardano:mainnet:a1b2c3d4e5f6...`
- `did:cardano:preprod:abc123def456...`
- `did:cardano:preview:xyz789abc123...`

### Using the DID Resolver

#### Lucid Evolution

```typescript
import { CardanoDIDResolver } from './did-resolver.ts';
import { DecentralizedIdentity } from './identity.ts';

// Initialize identity contract
const identity = new DecentralizedIdentity({
  network: 'Preprod',
  provider: 'koios',
});
await identity.initialize();
identity.selectWalletFromSeed(seedPhrase);

// Create DID resolver
const resolver = new CardanoDIDResolver(identity, 'preprod');

// Generate DID from policy ID
const did = CardanoDIDResolver.generateDID(policyId, 'preprod');
console.log('DID:', did);

// Resolve DID to DID Document
const didDocument = await resolver.resolve(did);
console.log(JSON.stringify(didDocument, null, 2));
```

#### MeshJS

```typescript
import { MeshDIDResolver } from './did-resolver.ts';
import { MeshIdentityContract } from './identity.ts';

const contract = new MeshIdentityContract({
  type: 'koios',
  network: 'preprod',
});
await contract.initialize(wallet);

const resolver = new MeshDIDResolver(contract, 'preprod');
const did = MeshDIDResolver.generateDID(policyId, 'preprod');
const didDocument = await resolver.resolve(did);
```

#### Java

```java
import DIDResolver;

DIDResolver resolver = new DIDResolver("preprod");
String did = DIDResolver.generateDID(policyId, "preprod");

// Resolve with identity datum from chain
IdentityDatum datum = getIdentityDatumFromChain();
DIDDocument didDoc = resolver.resolve(did, datum);
String json = resolver.resolveToJSON(did, datum);
System.out.println(json);
```

### Example DID Document

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "did:cardano:preprod:a1b2c3d4e5f6...",
  "controller": ["did:cardano:preprod:a1b2c3d4e5f6..."],
  "verificationMethod": [
    {
      "id": "did:cardano:preprod:a1b2c3d4e5f6...#owner",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:cardano:preprod:a1b2c3d4e5f6...",
      "blockchainAccountId": "cardano:preprod:1234567890abcdef..."
    },
    {
      "id": "did:cardano:preprod:a1b2c3d4e5f6...#delegate-0",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:cardano:preprod:a1b2c3d4e5f6...",
      "blockchainAccountId": "cardano:preprod:abcdef1234567890..."
    }
  ],
  "authentication": [
    "did:cardano:preprod:a1b2c3d4e5f6...#owner",
    "did:cardano:preprod:a1b2c3d4e5f6...#delegate-0"
  ],
  "assertionMethod": ["did:cardano:preprod:a1b2c3d4e5f6...#owner"],
  "keyAgreement": [],
  "capabilityInvocation": ["did:cardano:preprod:a1b2c3d4e5f6...#owner"],
  "capabilityDelegation": ["did:cardano:preprod:a1b2c3d4e5f6...#owner"],
  "service": [
    {
      "id": "did:cardano:preprod:a1b2c3d4e5f6...#service-0",
      "type": "LinkedDomains",
      "serviceEndpoint": "https://example.com"
    }
  ],
  "cardanoIdentity": {
    "network": "preprod",
    "nonce": 5,
    "attributes": {
      "name": "Alice",
      "email": "alice@example.com"
    }
  }
}
```

### Delegate Types and Verification Relationships

| Delegate Type | Verification Relationship | Purpose                             |
| ------------- | ------------------------- | ----------------------------------- |
| `veriKey`     | `authentication`          | Off-chain signature verification    |
| `sigAuth`     | `assertionMethod`         | On-chain authorization              |
| `enc`         | `keyAgreement`            | Encryption key for secure messaging |

### Service Endpoints

Service endpoints can be added as attributes with names starting with `did/svc/`:

```typescript
// Add a LinkedDomains service
await identity.setAttribute(
  'did/svc/LinkedDomains',
  'https://example.com',
  0n // permanent
);

// Add a DIDCommMessaging service
await identity.setAttribute(
  'did/svc/DIDCommMessaging',
  'https://example.com/didcomm',
  0n
);
```

These will automatically appear in the resolved DID Document under the `service` array

- Service endpoints
- Verification methods
- Authentication references

Example attribute for DID Document:

```typescript
await identity.setAttribute(
  "did/document",
  JSON.stringify({
    "@context": ["https://www.w3.org/ns/did/v1"],
    "id": "did:cardano:preprod:<identity-hash>",
    "authentication": [...],
    "service": [...]
  }),
  0n // Permanent
);
```

## 🛠️ Development Approach with Cardano

### Choosing Your Development Stack

For guidance on selecting the right tools and technologies for your Cardano development needs, consult the **[Cardano Tool Compass](https://github.com/cardano-foundation/cardano-tool-compass)** - a comprehensive guide to help you navigate the Cardano development ecosystem.

### Smart Contract Development

This implementation uses **Aiken** for smart contracts:

- Modern functional programming approach
- Strong type safety
- Excellent tooling and testing support
- PlutusV3 support

### Off-chain Development

Multiple off-chain implementations are provided:

- **Lucid Evolution** (TypeScript/Deno) - Modern, type-safe
- **MeshJS** (TypeScript) - Browser and Node.js compatible
- **CCL Java** (Java) - Enterprise-friendly

## 📖 References

- [EIP-1056: Ethereum Lightweight Identity](https://eips.ethereum.org/EIPS/eip-1056)
- [W3C DID Core Specification](https://www.w3.org/TR/did-core/)
- [Aiken Documentation](https://aiken-lang.org/)
- [Lucid Evolution](https://github.com/Anastasia-Labs/lucid-evolution)
- [MeshJS](https://meshjs.dev/)
- [Cardano Client Lib](https://github.com/bloxbean/cardano-client-lib)

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](../LICENSE) file for details. 4. **Integration**: Develop off-chain components for user identity management 5. **Deployment**: Deploy to Cardano mainnet after comprehensive security auditing

### Cardano-Specific Considerations

- **Native Tokens**: Use Cardano native tokens for identity credentials and badges
- **Metadata Standards**: Follow emerging DID and verifiable credential standards
- **UTXO Model**: Design efficient identity operations using UTXO parallelization
- **Privacy Features**: Implement zero-knowledge proofs within Cardano script constraints
- **Interoperability**: Ensure compatibility with other blockchain identity systems

## 🤝 Contributing

This smart contract serves as an educational example of decentralized identity management on Cardano. Contributions, improvements, and discussions are welcome!

## ⚠️ Disclaimer

This is an educational project demonstrating decentralized identity capabilities on Cardano. Always audit contracts thoroughly before using for identity-critical applications. Ensure compliance with local regulations regarding digital identity and privacy.
