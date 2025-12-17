# Decentralized Identity - Aiken Smart Contracts

This directory contains the on-chain smart contracts for the Decentralized Identity system, implementing EIP-1056 style identity management adapted for Cardano's UTXO model.

## Overview

The implementation consists of two validators:

1. **Identity NFT Minting Policy** (`identity_nft.ak`) - One-shot minting policy for creating unique identity tokens
2. **Identity Validator** (`identity.ak`) - Spend validator for managing identity state (ownership, delegates, attributes)

## Building

```bash
cd onchain/aiken
aiken build
```

This generates `plutus.json` containing the compiled validators.

## Testing

```bash
aiken check
```

## Architecture

### Identity Model

Each identity is represented by a UTXO containing:

- **Identity NFT**: Unique token proving identity ownership
- **Inline Datum**: `IdentityDatum` containing owner, delegates, attributes, and nonce

### Data Types

```aiken
type Delegate {
  delegate_address: VerificationKeyHash,
  delegate_type: ByteArray,
  valid_until: Int,
}

type Attribute {
  name: ByteArray,
  value: ByteArray,
  valid_until: Int,
}

type IdentityDatum {
  identity: VerificationKeyHash,
  owner: VerificationKeyHash,
  delegates: List<Delegate>,
  attributes: List<Attribute>,
  nonce: Int,
}
```

### Actions

| Action            | Description                       | Required Signature |
| ----------------- | --------------------------------- | ------------------ |
| `ChangeOwner`     | Transfer identity ownership       | Current owner      |
| `AddDelegate`     | Add delegate with validity period | Current owner      |
| `RevokeDelegate`  | Remove delegate before expiration | Current owner      |
| `SetAttribute`    | Add or update attribute           | Current owner      |
| `RevokeAttribute` | Remove attribute                  | Current owner      |

### Delegate Types

Standard delegate types following EIP-1056:

- `veriKey` - Verification key for off-chain signatures
- `sigAuth` - Signature authentication for on-chain authorization
- `enc` - Encryption key for key agreement

## Security Features

1. **Nonce Protection**: Every state change increments nonce to prevent replay attacks
2. **Time-based Validity**: Delegates and attributes can have expiration times
3. **NFT Uniqueness**: One-shot minting ensures globally unique identity tokens
4. **Owner Authorization**: All mutations require owner signature

## File Structure

```
aiken/
├── aiken.toml          # Project configuration
├── README.md           # This file
├── lib/
│   └── types.ak        # Shared type definitions
├── validators/
│   ├── identity.ak     # Main identity validator
│   └── identity_nft.ak # NFT minting policy
└── tests/
    └── identity_test.ak # Unit tests
```

## Usage with Off-chain Code

After building, import the compiled validators from `plutus.json`:

```typescript
import blueprint from './plutus.json';

const identityNftValidator = blueprint.validators.find(
  (v) => v.title === 'identity_nft.identity_nft'
);
const identityValidator = blueprint.validators.find(
  (v) => v.title === 'identity.identity'
);
```

## License

Apache-2.0
