//// Decentralized Identity - Type Definitions
////
//// This module defines all shared types used by the decentralized identity
//// smart contracts, implementing EIP-1056 style identity management.

use aiken/crypto.{VerificationKeyHash}

// ============================================================================
// DELEGATE TYPES
// ============================================================================

/// Standard delegate type identifiers following EIP-1056 conventions.
/// These are commonly used delegate types for identity verification.
pub const delegate_type_veri_key: ByteArray = "veriKey"

pub const delegate_type_sig_auth: ByteArray = "sigAuth"

pub const delegate_type_enc: ByteArray = "enc"

/// Represents a delegate authorized to act on behalf of an identity.
/// Delegates have a specific type and an optional expiration time.
///
/// # Fields
/// * `delegate_address` - The verification key hash of the delegate
/// * `delegate_type` - The type of delegation (e.g., "verily", "sigAuth")
/// * `valid_until` - POSIX timestamp (ms) when delegation expires, 0 for permanent
pub type Delegate {
  delegate_address: VerificationKeyHash,
  delegate_type: ByteArray,
  valid_until: Int,
}

// ============================================================================
// ATTRIBUTE TYPES
// ============================================================================

/// Represents an identity attribute (key-value pair with optional expiration).
/// Attributes can store arbitrary data associated with an identity.
///
/// # Fields
/// * `name` - The attribute name/key (e.g., "did/pub/Ed25519/veriKey/base58")
/// * `value` - The attribute value as raw bytes
/// * `valid_until` - POSIX timestamp (ms) when attribute expires, 0 for permanent
pub type Attribute {
  name: ByteArray,
  value: ByteArray,
  valid_until: Int,
}

// ============================================================================
// IDENTITY DATUM
// ============================================================================

/// The main datum stored in identity UTXOs.
/// Contains all state for a decentralized identity.
///
/// # Fields
/// * `identity` - The original identity address (never changes)
/// * `owner` - Current owner who controls the identity (can be transferred)
/// * `delegates` - List of authorized delegates with their types and validity
/// * `attributes` - List of identity attributes
/// * `nonce` - Monotonically increasing counter for replay protection
pub type IdentityDatum {
  identity: VerificationKeyHash,
  owner: VerificationKeyHash,
  delegates: List<Delegate>,
  attributes: List<Attribute>,
  nonce: Int,
}

// ============================================================================
// REDEEMER TYPES - IDENTITY VALIDATOR
// ============================================================================

/// Actions that can be performed on an identity.
/// Each action modifies the identity state in a specific way.
pub type IdentityAction {
  /// Transfer identity ownership to a new owner.
  /// The new owner gains full control over the identity.
  ChangeOwner { new_owner: VerificationKeyHash }
  /// Add a new delegate with a specific type and validity period.
  /// The delegate becomes valid immediately and expires after `validity` ms.
  AddDelegate {
    delegate_type: ByteArray,
    delegate: VerificationKeyHash,
    validity: Int,
  }
  /// Remove an existing delegate before their expiration.
  /// Requires matching both delegate address and type.
  RevokeDelegate { delegate_type: ByteArray, delegate: VerificationKeyHash }
  /// Add or update an attribute with a validity period.
  /// If an attribute with the same name exists, it is replaced.
  SetAttribute { name: ByteArray, value: ByteArray, validity: Int }
  /// Remove an existing attribute.
  /// Requires matching both name and value for precise removal.
  RevokeAttribute { name: ByteArray, value: ByteArray }
}

// ============================================================================
// REDEEMER TYPES - MINTING POLICY
// ============================================================================

/// Actions for the identity NFT minting policy.
pub type MintAction {
  /// Create a new identity by minting a unique identity NFT.
  /// Uses one-shot minting pattern tied to a specific UTXO.
  CreateIdentity
  /// Burn the identity NFT, effectively destroying the on-chain identity.
  /// This is optional and allows identity cleanup.
  DestroyIdentity
}
