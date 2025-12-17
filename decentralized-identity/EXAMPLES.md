# 📘 Decentralized Identity - Usage Examples

This document provides comprehensive examples demonstrating the complete lifecycle of decentralized identities on Cardano.

## Table of Contents

- [Quick Start](#quick-start)
- [Identity Lifecycle](#identity-lifecycle)
- [Delegate Management](#delegate-management)
- [Attribute Management](#attribute-management)
- [DID Resolution](#did-resolution)
- [Advanced Use Cases](#advanced-use-cases)

---

## Quick Start

### Prerequisites

Choose your preferred framework:

**Lucid Evolution (TypeScript/Deno)**

```bash
cd decentralized-identity/offchain/lucid-evolution
deno run -A identity.ts
```

**MeshJS (TypeScript)**

```bash
cd decentralized-identity/offchain/meshjs
deno run -A identity.ts
```

**CCL Java**

```bash
cd decentralized-identity/offchain/ccl-java
jbang Identity.java
```

---

## Identity Lifecycle

### 1. Create a New Identity

Creating an identity mints a unique NFT and establishes the initial on-chain datum.

#### Lucid Evolution Example

```typescript
// Import the identity service
import { CardanoIdentityService } from './identity.ts';

// Initialize on Preprod testnet
const identity = new CardanoIdentityService('Preprod');
await identity.initialize();

// Setup wallet (generates new if needed)
await identity.setupWallet('path/to/wallet.json');

// Create identity
const result = await identity.createIdentity();

console.log('Identity NFT Policy:', result.policyId);
console.log('Identity NFT Name:', result.assetName);
console.log('Transaction Hash:', result.txHash);
```

**Output:**

```
✅ Identity created successfully!

Identity NFT Policy: a1b2c3d4e5f6...
Identity NFT Name: identity_7f8e9d...
Transaction Hash: f1e2d3c4b5a6...
Identity Address: addr_test1vq...
```

#### MeshJS Example

```typescript
import { MeshIdentityService } from './identity.ts';

const identity = new MeshIdentityService('Preprod');
await identity.initialize();
await identity.setupWallet('wallet.json');

const result = await identity.createIdentity();
console.log('Created identity:', result.policyId);
```

#### Java Example

```java
// Using JBang - run directly:
// jbang Identity.java create

public static void createIdentity() {
    Network network = Networks.preprod();
    Account owner = new Account(network);

    CardanoIdentityService service = new CardanoIdentityService(network);

    // Create identity with NFT
    Result result = service.createIdentity(owner);

    System.out.println("Identity NFT: " + result.policyId());
    System.out.println("Tx Hash: " + result.txHash());
}
```

---

### 2. Transfer Identity Ownership

Transfer complete control of an identity to a new owner.

#### Lucid Evolution Example

```typescript
const identity = new CardanoIdentityService('Preprod');
await identity.initialize();
await identity.setupWallet('current-owner-wallet.json');

// Transfer to new owner
const newOwnerAddress = 'addr_test1vp...new_owner...';
const newOwnerPubKeyHash = 'e5f6a7b8c9d0...';

const result = await identity.changeOwner(
  identityPolicyId,
  identityAssetName,
  newOwnerPubKeyHash
);

console.log('Ownership transferred!');
console.log('New owner:', newOwnerAddress);
console.log('Tx Hash:', result.txHash);
```

**Key Points:**

- Current owner must sign the transaction
- Identity NFT is preserved
- All delegates and attributes remain intact
- New owner gains full control

---

## Delegate Management

Delegates are authorized addresses that can act on behalf of the identity with specific privileges.

### 3. Add a Delegate

Grant temporary authorization to another address.

#### Lucid Evolution Example

```typescript
const identity = new CardanoIdentityService('Preprod');
await identity.initialize();
await identity.setupWallet('owner-wallet.json');

// Add delegate with 30-day validity
const delegateAddress = 'addr_test1vq...delegate...';
const delegatePubKeyHash = 'd4e5f6a7b8c9...';
const delegateType = 'sigAuth'; // Signature authentication
const validityDays = 30;

const result = await identity.addDelegate(
  identityPolicyId,
  identityAssetName,
  delegateType,
  delegatePubKeyHash,
  validityDays
);

console.log('Delegate added successfully!');
console.log('Type:', delegateType);
console.log('Valid until:', new Date(result.validUntil));
```

#### Delegate Types

| Type      | Purpose                  | Use Case                                |
| --------- | ------------------------ | --------------------------------------- |
| `veriKey` | Verification Key         | Off-chain signature verification        |
| `sigAuth` | Signature Authentication | On-chain transaction authorization      |
| `enc`     | Encryption/Key Agreement | Encrypted communication, key exchange   |
| `custom`  | Application-specific     | Domain-specific delegation (e.g., DeFi) |

#### MeshJS Example

```typescript
import { MeshIdentityService } from './identity.ts';

const identity = new MeshIdentityService('Preprod');
await identity.initialize();
await identity.setupWallet('wallet.json');

// Add delegate for 90 days
const result = await identity.addDelegate(
  policyId,
  assetName,
  'veriKey', // Verification key delegate
  delegatePKH,
  90 // Valid for 90 days
);
```

---

### 4. Revoke a Delegate

Remove authorization from a delegate before expiration.

#### Lucid Evolution Example

```typescript
const identity = new CardanoIdentityService('Preprod');
await identity.initialize();
await identity.setupWallet('owner-wallet.json');

const result = await identity.revokeDelegate(
  identityPolicyId,
  identityAssetName,
  'sigAuth',
  delegatePubKeyHash
);

console.log('Delegate revoked!');
console.log('Tx Hash:', result.txHash);
```

**Security Note:** Delegates automatically expire based on their `valid_until` timestamp, but explicit revocation provides immediate termination.

---

## Attribute Management

Attributes store key-value pairs associated with an identity, enabling verifiable claims and metadata.

### 5. Set an Attribute

Add or update an identity attribute.

#### Lucid Evolution Example

```typescript
const identity = new CardanoIdentityService('Preprod');
await identity.initialize();
await identity.setupWallet('owner-wallet.json');

// Set email attribute with 1-year validity
const result = await identity.setAttribute(
  identityPolicyId,
  identityAssetName,
  'did/svc/email', // Attribute name
  'mailto:alice@example.com', // Attribute value
  365 // Valid for 365 days
);

console.log('Attribute set successfully!');
console.log('Name:', 'did/svc/email');
console.log('Value:', 'mailto:alice@example.com');
```

#### Common Attribute Patterns

**Service Endpoints:**

```typescript
// Website
await identity.setAttribute(
  policyId,
  assetName,
  'did/svc/website',
  'https://alice.cardano',
  365
);

// Social media
await identity.setAttribute(
  policyId,
  assetName,
  'did/svc/twitter',
  'https://twitter.com/alice',
  365
);

// Messaging
await identity.setAttribute(
  policyId,
  assetName,
  'did/svc/matrix',
  'matrix:u/alice:matrix.org',
  365
);
```

**Verifiable Credentials:**

```typescript
// Professional certification
await identity.setAttribute(
  policyId,
  assetName,
  'credential/certification',
  'ipfs://QmHash...', // Link to credential
  1825 // 5 years
);

// Age verification (privacy-preserving)
await identity.setAttribute(
  policyId,
  assetName,
  'claim/over18',
  'true',
  1095 // 3 years
);
```

#### MeshJS Example

```typescript
const identity = new MeshIdentityService('Preprod');
await identity.initialize();
await identity.setupWallet('wallet.json');

// Set GitHub profile
const result = await identity.setAttribute(
  policyId,
  assetName,
  'did/svc/github',
  'https://github.com/alice',
  730 // Valid for 2 years
);
```

---

### 6. Revoke an Attribute

Remove an attribute from the identity.

#### Lucid Evolution Example

```typescript
const identity = new CardanoIdentityService('Preprod');
await identity.initialize();
await identity.setupWallet('owner-wallet.json');

const result = await identity.revokeAttribute(
  identityPolicyId,
  identityAssetName,
  'did/svc/email',
  'mailto:alice@example.com'
);

console.log('Attribute revoked!');
```

**Important:** Both the attribute name AND value must match exactly for revocation.

---

## DID Resolution

Resolve a Cardano-based Decentralized Identifier (DID) to a W3C-compliant DID Document.

### 7. Resolve DID to DID Document

#### DID Format

```
did:cardano:<network>:<identity_nft_policy_id>
```

**Examples:**

- `did:cardano:mainnet:a1b2c3d4e5f6...`
- `did:cardano:preprod:f6e5d4c3b2a1...`
- `did:cardano:preview:123abc456def...`

#### Lucid Evolution DID Resolver

```typescript
import { CardanoDIDResolver } from './did-resolver.ts';

// Initialize resolver
const resolver = new CardanoDIDResolver('Preprod');
await resolver.initialize();

// Resolve DID
const policyId = 'a1b2c3d4e5f6...';
const didDocument = await resolver.resolveDID(policyId);

console.log('DID Document:');
console.log(JSON.stringify(didDocument, null, 2));
```

**Output:**

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "did:cardano:preprod:a1b2c3d4e5f6...",
  "controller": "did:cardano:preprod:a1b2c3d4e5f6...",
  "verificationMethod": [
    {
      "id": "did:cardano:preprod:a1b2c3d4e5f6...#owner",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:cardano:preprod:a1b2c3d4e5f6...",
      "publicKeyMultibase": "z6MkpTHz..."
    },
    {
      "id": "did:cardano:preprod:a1b2c3d4e5f6...#delegate-sigAuth-1",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:cardano:preprod:a1b2c3d4e5f6...",
      "publicKeyMultibase": "z6MkqRYq..."
    }
  ],
  "authentication": [
    "did:cardano:preprod:a1b2c3d4e5f6...#owner",
    "did:cardano:preprod:a1b2c3d4e5f6...#delegate-sigAuth-1"
  ],
  "assertionMethod": ["did:cardano:preprod:a1b2c3d4e5f6...#owner"],
  "service": [
    {
      "id": "did:cardano:preprod:a1b2c3d4e5f6...#email",
      "type": "EmailService",
      "serviceEndpoint": "mailto:alice@example.com"
    }
  ]
}
```

#### MeshJS DID Resolver

```typescript
import { MeshDIDResolver } from './did-resolver.ts';

const resolver = new MeshDIDResolver('Preprod');
await resolver.initialize();

const didDocument = await resolver.resolveDID(policyId);
console.log(JSON.stringify(didDocument, null, 2));
```

#### Java DID Resolver

```bash
# Using JBang
jbang DIDResolver.java generate a1b2c3d4e5f6... preprod
```

**Output:**

```json
{
  "@context": [...],
  "id": "did:cardano:preprod:a1b2c3d4e5f6...",
  "verificationMethod": [...],
  "authentication": [...],
  "service": [...]
}
```

#### CLI Usage

**Lucid Evolution:**

```bash
cd offchain/lucid-evolution
deno run -A did-resolver.ts generate <policy_id> [network]
```

**MeshJS:**

```bash
cd offchain/meshjs
deno run -A did-resolver.ts generate <policy_id> [network]
```

**Java:**

```bash
cd offchain/ccl-java
jbang DIDResolver.java generate <policy_id> [network]
```

---

## Advanced Use Cases

### 8. Multi-Signature Authorization

Combine owner and delegate signatures for sensitive operations.

#### Scenario: Corporate Identity

```typescript
// Setup: Corporate identity with multiple delegates
const corporateIdentity = await identity.createIdentity();

// Add CFO as financial delegate
await identity.addDelegate(policyId, assetName, 'finance', cfoPubKeyHash, 365);

// Add CTO as technical delegate
await identity.addDelegate(
  policyId,
  assetName,
  'technical',
  ctoPubKeyHash,
  365
);

// Add Legal as compliance delegate
await identity.addDelegate(
  policyId,
  assetName,
  'compliance',
  legalPubKeyHash,
  365
);
```

---

### 9. Verifiable Credential Issuance

Issue verifiable credentials using identity attributes.

#### Scenario: University Diploma

```typescript
// University identity issues diploma credential
const universityIdentity = 'did:cardano:mainnet:univ123...';

// Student identity receives credential attribute
await identity.setAttribute(
  studentPolicyId,
  studentAssetName,
  'credential/diploma',
  JSON.stringify({
    type: 'UniversityDiploma',
    issuer: universityIdentity,
    degree: 'Master of Science',
    field: 'Computer Science',
    dateIssued: '2024-05-15',
    credentialHash: 'sha256:abc123...',
  }),
  3650 // 10 years
);

// Verify credential by resolving both DIDs
const studentDID = await resolver.resolveDID(studentPolicyId);
const universityDID = await resolver.resolveDID('univ123...');
```

---

### 10. Time-Limited Access Control

Grant temporary access that automatically expires.

#### Scenario: Project Collaboration

```typescript
// Add contractor as delegate for project duration
await identity.addDelegate(
  policyId,
  assetName,
  'projectAccess',
  contractorPubKeyHash,
  90 // 90-day project
);

// Contractor can now interact with project resources
// After 90 days, access automatically expires
```

---

### 11. Privacy-Preserving Claims

Store privacy-preserving proofs without revealing sensitive data.

#### Scenario: Age Verification

```typescript
// Instead of storing birthdate, store zero-knowledge proof
await identity.setAttribute(
  policyId,
  assetName,
  'zkp/age_over_21',
  'proof:zk-SNARK:0x1234abcd...', // ZK proof hash
  1825 // 5 years
);

// Verifier can validate proof without knowing actual age
const didDoc = await resolver.resolveDID(policyId);
const ageProof = didDoc.service.find((s) => s.type === 'zkp/age_over_21');
```

---

### 12. Cross-Chain Identity Bridge

Link Cardano identity with other blockchain identities.

```typescript
// Link to Ethereum identity
await identity.setAttribute(
  policyId,
  assetName,
  'bridge/ethereum',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  0 // Permanent link
);

// Link to Bitcoin identity
await identity.setAttribute(
  policyId,
  assetName,
  'bridge/bitcoin',
  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  0
);

// Resolve to get all linked identities
const didDoc = await resolver.resolveDID(policyId);
```

---

## Error Handling

### Common Errors and Solutions

**1. Insufficient Funds**

```typescript
try {
  await identity.createIdentity();
} catch (error) {
  if (error.message.includes('UTxOBalanceInsufficientError')) {
    console.log('Need more ADA in wallet for transaction fees');
  }
}
```

**2. Invalid Delegate Type**

```typescript
// ❌ Wrong
await identity.addDelegate(policyId, assetName, 'invalid_type', pkh, 30);

// ✅ Correct - use standard types
await identity.addDelegate(policyId, assetName, 'sigAuth', pkh, 30);
```

**3. Expired Delegate**

```typescript
// Check delegate validity before operations
const didDoc = await resolver.resolveDID(policyId);
const currentTime = Date.now();

const validDelegates = didDoc.verificationMethod.filter((vm) => {
  // Filter out expired delegates
  return vm.validUntil === 0 || vm.validUntil > currentTime;
});
```

---

## Testing

### Unit Tests

Run on-chain tests:

```bash
cd onchain/aiken
aiken check
```

### Integration Tests

Run off-chain integration tests:

```bash
# Lucid Evolution
cd offchain/lucid-evolution
deno test -A

# MeshJS
cd offchain/meshjs
deno test -A

# Java
cd offchain/ccl-java
jbang test Identity.java
```

### Local Testnet

Test on local preview network:

```bash
# Start local node
docker run -it -p 3001:3001 ghcr.io/intersectmbo/cardano-node:latest

# Point to local node
export CARDANO_NODE_SOCKET_PATH=/path/to/node.socket
```

---

## Resources

- **W3C DID Core**: https://www.w3.org/TR/did-core/
- **EIP-1056**: https://eips.ethereum.org/EIPS/eip-1056
- **Aiken Documentation**: https://aiken-lang.org/
- **Lucid Evolution**: https://lucid.spacebudz.io/
- **MeshJS**: https://meshjs.dev/
- **Cardano Developer Portal**: https://developers.cardano.org/

---

## Next Steps

1. **Deploy to Mainnet**: Follow the [deployment guide](./README.md#deployment)
2. **Integrate with DApps**: Use identity for authentication in your applications
3. **Build DID Resolver Service**: Create a public DID resolution API
4. **Implement VC Issuance**: Build verifiable credential issuance workflows
5. **Cross-Chain Integration**: Bridge with other blockchain identity systems

For more information, see:

- [Implementation Plan](./IMPLEMENTATION_PLAN.md)
- [Architecture Diagrams](./ARCHITECTURE_DIAGRAMS.md)
- [Main README](./README.md)
