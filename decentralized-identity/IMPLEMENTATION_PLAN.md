# 🆔 Decentralized Identity Implementation Plan

## Executive Summary

This document outlines the research, architecture, and implementation plan for the Decentralized Identity smart contract based on EIP-1056 (Ethereum DID Registry), adapted for Cardano's UTXO model using Aiken for on-chain code and multiple off-chain frameworks.

---

## 📚 Research Findings

### ERC-1056 / EIP-1056 Overview

ERC-1056 is a lightweight identity standard that provides:

1. **Address-based Identity**: Any Ethereum address is automatically an identity (no registration needed)
2. **Owner Management**: Identity owners can be changed via `changeOwner`
3. **Delegate Management**: Temporary delegates with time-limited validity
4. **Attribute Management**: Key-value pairs for identity attributes

#### Core Functions from ERC-1056:

```javascript
// Identity Ownership
function identityOwner(address identity) view returns(address);
function changeOwner(address identity, address newOwner);
function changeOwnerSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, address newOwner);

// Delegate Management
function validDelegate(address identity, bytes32 delegateType, address delegate) view returns(bool);
function addDelegate(address identity, bytes32 delegateType, address delegate, uint validity);
function addDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 delegateType, address delegate, uint validity);
function revokeDelegate(address identity, bytes32 delegateType, address delegate);
function revokeDelegateSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 delegateType, address delegate);

// Attribute Management
function setAttribute(address identity, bytes32 name, bytes value, uint validity);
function setAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 name, bytes value, uint validity);
function revokeAttribute(address identity, bytes32 name, bytes value);
function revokeAttributeSigned(address identity, uint8 sigV, bytes32 sigR, bytes32 sigS, bytes32 name, bytes value);
```

### Cardano UTXO Model Considerations

Unlike Ethereum's account model, Cardano uses UTXOs which requires different design patterns:

| Ethereum (Account Model) | Cardano (UTXO Model)                         |
| ------------------------ | -------------------------------------------- |
| Global state in contract | State in datum per UTXO                      |
| Single contract address  | Multiple UTXOs at script address             |
| msg.sender for identity  | Signature verification via extra_signatories |
| Block-based validity     | POSIX time-based validity via validity_range |
| Mapping storage          | Datum contains all state                     |
| Events for history       | Metadata + datum changes                     |

### Existing Repository Patterns

Based on analysis of existing implementations:

1. **Datum Patterns**: State stored in inline datums with typed structures
2. **Redeemer Patterns**: Actions as enum types with associated parameters
3. **Signature Verification**: Using `vodka_extra_signatories.{key_signed, all_key_signed}`
4. **Time Constraints**: Using `vodka_validity_range.{valid_after, valid_before}`
5. **Libraries**: `aiken-lang/stdlib`, `sidan-lab/vodka`

---

## 🏗️ Architecture Design

### On-Chain Design (Aiken)

#### Identity Registry Model

Instead of a global registry contract, we use a **UTXO-per-identity** model:

```
Each identity = 1 UTXO at the script address with:
- Datum: IdentityDatum (owner, delegates, attributes)
- Value: Minimum ADA + optional tokens
- Identity NFT: Unique identifier for the identity
```

#### Data Types

```aiken
/// Represents a delegate with type and validity
pub type Delegate {
  delegate_address: VerificationKeyHash,
  delegate_type: ByteArray,        // e.g., "veriKey", "sigAuth"
  valid_until: Int,                // POSIX timestamp (milliseconds)
}

/// Represents an identity attribute
pub type Attribute {
  name: ByteArray,
  value: ByteArray,
  valid_until: Int,                // POSIX timestamp (milliseconds)
}

/// Main identity datum stored in UTXO
pub type IdentityDatum {
  identity: VerificationKeyHash,     // The identity address
  owner: VerificationKeyHash,        // Current owner (can be different from identity)
  delegates: List<Delegate>,         // List of active delegates
  attributes: List<Attribute>,       // List of attributes
  nonce: Int,                        // For replay protection
}

/// Actions that can be performed on the identity
pub type IdentityAction {
  ChangeOwner { new_owner: VerificationKeyHash }
  AddDelegate { delegate_type: ByteArray, delegate: VerificationKeyHash, validity: Int }
  RevokeDelegate { delegate_type: ByteArray, delegate: VerificationKeyHash }
  SetAttribute { name: ByteArray, value: ByteArray, validity: Int }
  RevokeAttribute { name: ByteArray, value: ByteArray }
}
```

#### Minting Policy

For identity creation, we use a minting policy that creates a unique identity NFT:

```aiken
pub type MintAction {
  CreateIdentity        // Mint new identity NFT
  DestroyIdentity       // Burn identity NFT (optional)
}
```

#### Validator Logic

```
┌─────────────────────────────────────────────────────────────────┐
│                    Identity Validator                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ChangeOwner:                                                    │
│    ✓ Current owner must sign                                     │
│    ✓ Output datum has new owner                                  │
│    ✓ Nonce incremented                                           │
│    ✓ Identity NFT preserved                                      │
│                                                                  │
│  AddDelegate:                                                    │
│    ✓ Owner must sign                                             │
│    ✓ Delegate added to list with validity time                   │
│    ✓ validity_time = current_time + validity_period              │
│    ✓ Nonce incremented                                           │
│                                                                  │
│  RevokeDelegate:                                                 │
│    ✓ Owner must sign                                             │
│    ✓ Delegate removed from list                                  │
│    ✓ Nonce incremented                                           │
│                                                                  │
│  SetAttribute:                                                   │
│    ✓ Owner must sign                                             │
│    ✓ Attribute added/updated with validity time                  │
│    ✓ Nonce incremented                                           │
│                                                                  │
│  RevokeAttribute:                                                │
│    ✓ Owner must sign                                             │
│    ✓ Attribute removed from list                                 │
│    ✓ Nonce incremented                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Off-Chain Design

#### Transaction Builders

1. **Create Identity**: Mint identity NFT + create UTXO with initial datum
2. **Change Owner**: Spend identity UTXO, produce new with updated owner
3. **Manage Delegates**: Spend identity UTXO, update delegate list
4. **Manage Attributes**: Spend identity UTXO, update attribute list
5. **Query Identity**: Read UTXO datum to check owner, delegates, attributes

#### DID Document Resolution

The off-chain code will construct W3C DID Documents from the datum:

```json
{
  "@context": "https://www.w3.org/ns/did/v1",
  "id": "did:cardano:<identity_address>",
  "verificationMethod": [...],
  "authentication": [...],
  "assertionMethod": [...],
  "service": [...]
}
```

---

## 📋 Implementation Tasks

### Phase 1: On-Chain Implementation (Aiken)

```
decentralized-identity/
├── onchain/
│   └── aiken/
│       ├── aiken.toml
│       ├── README.md
│       ├── lib/
│       │   └── types.ak              # Shared type definitions
│       ├── validators/
│       │   ├── identity.ak           # Main identity validator
│       │   └── identity_nft.ak       # Minting policy for identity NFTs
│       └── tests/
│           └── identity_test.ak      # Unit tests
```

#### Task 1.1: Project Setup

- [ ] Create `aiken.toml` with dependencies
- [ ] Set up project structure

#### Task 1.2: Type Definitions (`lib/types.ak`)

- [ ] Define `Delegate` type
- [ ] Define `Attribute` type
- [ ] Define `IdentityDatum` type
- [ ] Define `IdentityAction` redeemer type
- [ ] Define `MintAction` type

#### Task 1.3: Identity NFT Minting Policy (`validators/identity_nft.ak`)

- [ ] Implement `CreateIdentity` logic (one-shot minting)
- [ ] Ensure unique token name per identity
- [ ] Validate initial datum structure

#### Task 1.4: Identity Validator (`validators/identity.ak`)

- [ ] Implement `ChangeOwner` action
- [ ] Implement `AddDelegate` action with validity period
- [ ] Implement `RevokeDelegate` action
- [ ] Implement `SetAttribute` action with validity period
- [ ] Implement `RevokeAttribute` action
- [ ] Add helper function for valid delegate check

#### Task 1.5: Tests (`tests/identity_test.ak`)

- [ ] Test identity creation
- [ ] Test owner change (authorized/unauthorized)
- [ ] Test delegate operations
- [ ] Test attribute operations
- [ ] Test time-based validity

### Phase 2: Off-Chain Implementation

#### Option A: Lucid Evolution (TypeScript/Deno)

```
decentralized-identity/
└── offchain/
    └── lucid-evolution/
        ├── deno.json
        ├── identity.ts               # Main implementation
        └── did-resolver.ts           # DID Document resolution
```

#### Option B: MeshJS (TypeScript)

```
decentralized-identity/
└── offchain/
    └── meshjs/
        ├── deno.json
        ├── identity.ts
        └── did-resolver.ts
```

#### Option C: CCL Java

```
decentralized-identity/
└── offchain/
    └── ccl-java/
        ├── DecentralizedIdentity.java
        └── DIDResolver.java
```

### Phase 3: Documentation & Examples

- [ ] Update README.md with implementation details
- [ ] Add usage examples
- [ ] Add DID Document resolution examples
- [ ] Add integration guide

---

## 🔧 Technical Specifications

### Identity NFT Token Name

```
Token Name = sha2_256(tx_hash ++ output_index)[:28]
```

This ensures unique identity tokens using the one-shot minting pattern.

### Delegate Types (Standard)

| Type      | Description              | Use Case                         |
| --------- | ------------------------ | -------------------------------- |
| `veriKey` | Verification Key         | Off-chain signature verification |
| `sigAuth` | Signature Authentication | On-chain signing authorization   |
| `enc`     | Encryption Key           | Key agreement                    |

### Time Handling

- All times in POSIX milliseconds
- `valid_until = 0` means no expiration (permanent)
- Delegates/attributes automatically expire when `current_time > valid_until`

### Signature Requirements

| Action          | Required Signature |
| --------------- | ------------------ |
| CreateIdentity  | Identity address   |
| ChangeOwner     | Current owner      |
| AddDelegate     | Current owner      |
| RevokeDelegate  | Current owner      |
| SetAttribute    | Current owner      |
| RevokeAttribute | Current owner      |

---

## 📊 Comparison: Ethereum vs Cardano Implementation

| Feature           | Ethereum (ERC-1056)    | Cardano (This Implementation) |
| ----------------- | ---------------------- | ----------------------------- |
| Identity Creation | Implicit (any address) | Explicit (mint NFT)           |
| State Storage     | Contract mapping       | UTXO datum                    |
| Identity Lookup   | Direct read            | Query by NFT                  |
| Delegate Validity | Block number           | POSIX timestamp               |
| Signed Operations | ecrecover              | extra_signatories             |
| Events            | Solidity events        | Datum changes + metadata      |
| Gas/Fees          | Per operation gas      | Per transaction fee           |
| Parallelization   | Limited                | UTXO parallelism              |

---

## 🔐 Security Considerations

1. **Replay Protection**: Nonce in datum prevents replay attacks
2. **Time Manipulation**: Use tight validity ranges in transactions
3. **NFT Uniqueness**: One-shot minting ensures unique identities
4. **Owner Verification**: All mutations require owner signature
5. **Delegate Expiry**: Expired delegates automatically invalid

---

## 📁 Final Directory Structure

```
decentralized-identity/
├── README.md                         # Project documentation
├── IMPLEMENTATION_PLAN.md            # This file
├── onchain/
│   └── aiken/
│       ├── aiken.toml
│       ├── README.md
│       ├── plutus.json              # Generated after build
│       ├── lib/
│       │   └── types.ak
│       ├── validators/
│       │   ├── identity.ak
│       │   └── identity_nft.ak
│       └── tests/
│           └── identity_test.ak
└── offchain/
    ├── lucid-evolution/
    │   ├── deno.json
    │   ├── identity.ts
    │   └── did-resolver.ts
    ├── meshjs/
    │   ├── deno.json
    │   ├── identity.ts
    │   └── did-resolver.ts
    └── ccl-java/
        ├── DecentralizedIdentity.java
        └── DIDResolver.java
```

---

## ⏱️ Estimated Timeline

| Phase         | Tasks                     | Duration    |
| ------------- | ------------------------- | ----------- |
| Phase 1.1-1.2 | Project setup & types     | 1 day       |
| Phase 1.3     | Minting policy            | 1 day       |
| Phase 1.4     | Identity validator        | 2 days      |
| Phase 1.5     | Tests                     | 1 day       |
| Phase 2       | Off-chain (per framework) | 2 days each |
| Phase 3       | Documentation             | 1 day       |

**Total**: ~1-2 weeks for full implementation

---

## 🚀 Next Steps

1. **Approve this plan** and proceed with implementation
2. Start with Phase 1 (On-chain Aiken implementation)
3. Build and test on preview/preprod testnet
4. Implement off-chain frameworks
5. Document and add examples

---

## References

- [ERC-1056 Specification](https://github.com/ethereum/ERCs/blob/master/ERCS/erc-1056.md)
- [W3C DID Core Specification](https://www.w3.org/TR/did-core/)
- [Aiken Language Documentation](https://aiken-lang.org/)
- [Cardano Tool Compass](https://github.com/cardano-foundation/cardano-tool-compass)
