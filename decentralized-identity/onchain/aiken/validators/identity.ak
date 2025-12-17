//// Decentralized Identity - Spend Validator
////
//// This validator manages the state of decentralized identities on Cardano.
//// It implements EIP-1056 style identity management with ownership transfer,
//// delegate management, and attribute storage.

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval
use cardano/address.{Script}
use cardano/assets.{PolicyId, lovelace_of, tokens}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, ValidityRange,
  find_input,
}
use cocktail/vodka_extra_signatories.{key_signed}
use types.{
  AddDelegate, Attribute, ChangeOwner, Delegate, IdentityAction, IdentityDatum,
  RevokeAttribute, RevokeDelegate, SetAttribute,
}

// ============================================================================
// TIME HELPER FUNCTIONS
// ============================================================================

/// Extracts the lower bound of a validity range as a POSIX timestamp.
/// Returns 0 if the range has no lower bound.
///
/// # Arguments
/// * `validity_range` - The transaction validity range
///
/// # Returns
/// The lower bound timestamp in milliseconds, or 0 if unbounded
fn get_validity_lower_bound(validity_range: ValidityRange) -> Int {
  when validity_range.lower_bound.bound_type is {
    interval.Finite(time) -> time
    _ -> 0
  }
}

/// Extracts the upper bound of a validity range as a POSIX timestamp.
/// Returns a very large number if the range has no upper bound.
///
/// # Arguments
/// * `validity_range` - The transaction validity range
///
/// # Returns
/// The upper bound timestamp in milliseconds, or max int if unbounded
fn get_validity_upper_bound(validity_range: ValidityRange) -> Int {
  when validity_range.upper_bound.bound_type is {
    interval.Finite(time) -> time
    // Use a large value to represent "no upper bound"
    _ -> 9999999999999
  }
}

// ============================================================================
// DELEGATE HELPER FUNCTIONS
// ============================================================================

/// Adds a new delegate to the list, replacing any existing delegate
/// with the same address and type.
///
/// # Arguments
/// * `delegates` - Existing list of delegates
/// * `new_delegate` - The delegate to add
///
/// # Returns
/// Updated list with the new delegate
fn add_delegate(
  delegates: List<Delegate>,
  new_delegate: Delegate,
) -> List<Delegate> {
  let filtered =
    list.filter(
      delegates,
      fn(d) {
        !(d.delegate_address == new_delegate.delegate_address && d.delegate_type == new_delegate.delegate_type)
      },
    )
  [new_delegate, ..filtered]
}

/// Removes a delegate from the list by address and type.
///
/// # Arguments
/// * `delegates` - Existing list of delegates
/// * `delegate_type` - The type of delegate to remove
/// * `delegate_address` - The address of the delegate to remove
///
/// # Returns
/// Updated list without the specified delegate
fn remove_delegate(
  delegates: List<Delegate>,
  delegate_type: ByteArray,
  delegate_address: VerificationKeyHash,
) -> List<Delegate> {
  list.filter(
    delegates,
    fn(d) {
      !(d.delegate_address == delegate_address && d.delegate_type == delegate_type)
    },
  )
}

/// Checks if a delegate exists in the list (regardless of validity).
///
/// # Arguments
/// * `delegates` - List of delegates
/// * `delegate_type` - The type of delegate to find
/// * `delegate_address` - The address of the delegate to find
///
/// # Returns
/// True if delegate exists, False otherwise
fn delegate_exists(
  delegates: List<Delegate>,
  delegate_type: ByteArray,
  delegate_address: VerificationKeyHash,
) -> Bool {
  list.any(
    delegates,
    fn(d) {
      d.delegate_address == delegate_address && d.delegate_type == delegate_type
    },
  )
}

// ============================================================================
// ATTRIBUTE HELPER FUNCTIONS
// ============================================================================

/// Adds or updates an attribute in the list.
/// If an attribute with the same name exists, it is replaced.
///
/// # Arguments
/// * `attributes` - Existing list of attributes
/// * `new_attribute` - The attribute to add/update
///
/// # Returns
/// Updated list with the new attribute
fn set_attribute(
  attributes: List<Attribute>,
  new_attribute: Attribute,
) -> List<Attribute> {
  let filtered =
    list.filter(attributes, fn(a) { !(a.name == new_attribute.name) })
  [new_attribute, ..filtered]
}

/// Removes an attribute from the list by name and value.
///
/// # Arguments
/// * `attributes` - Existing list of attributes
/// * `name` - The attribute name
/// * `value` - The attribute value
///
/// # Returns
/// Updated list without the specified attribute
fn remove_attribute(
  attributes: List<Attribute>,
  name: ByteArray,
  value: ByteArray,
) -> List<Attribute> {
  list.filter(attributes, fn(a) { !(a.name == name && a.value == value) })
}

/// Checks if an attribute exists in the list.
///
/// # Arguments
/// * `attributes` - List of attributes
/// * `name` - The attribute name
/// * `value` - The attribute value
///
/// # Returns
/// True if attribute exists, False otherwise
fn attribute_exists(
  attributes: List<Attribute>,
  name: ByteArray,
  value: ByteArray,
) -> Bool {
  list.any(attributes, fn(a) { a.name == name && a.value == value })
}

// ============================================================================
// OUTPUT VALIDATION
// ============================================================================

/// Finds the continuing output at the same script address with the identity NFT.
///
/// # Arguments
/// * `outputs` - Transaction outputs
/// * `own_address` - The script address
/// * `policy_id` - The identity NFT policy ID
/// * `token_name` - The identity NFT token name
///
/// # Returns
/// The output containing the identity NFT, or None
fn find_continuing_output(
  outputs: List<Output>,
  own_address: cardano/address.Address,
  policy_id: PolicyId,
  token_name: ByteArray,
) -> Option<Output> {
  list.find(
    outputs,
    fn(output) {
      let is_same_address = output.address == own_address
      let has_identity_nft = {
        let output_tokens = tokens(output.value, policy_id) |> dict.to_pairs()
        list.any(
          output_tokens,
          fn(pair) { pair.1st == token_name && pair.2nd == 1 },
        )
      }
      is_same_address && has_identity_nft
    },
  )
}

/// Validates that the output datum is correctly updated based on the action.
///
/// # Arguments
/// * `input_datum` - The current datum
/// * `output_datum` - The new datum
/// * `action` - The action being performed
/// * `current_time` - The current transaction time (lower bound)
///
/// # Returns
/// True if the datum transition is valid
fn validate_datum_transition(
  input_datum: IdentityDatum,
  output_datum: IdentityDatum,
  action: IdentityAction,
  current_time: Int,
) -> Bool {
  // Identity must never change
  let identity_preserved = input_datum.identity == output_datum.identity

  // Nonce must always increment by exactly 1
  let nonce_incremented = output_datum.nonce == input_datum.nonce + 1

  let action_valid =
    when action is {
      ChangeOwner { new_owner } ->
        and {
          // Owner updated to new owner
          output_datum.owner == new_owner,
          // Delegates preserved
          output_datum.delegates == input_datum.delegates,
          // Attributes preserved
          output_datum.attributes == input_datum.attributes,
        }

      AddDelegate { delegate_type, delegate, validity } -> {
        let new_delegate =
          Delegate {
            delegate_address: delegate,
            delegate_type,
            valid_until: if validity == 0 {
              0
            } else {
              current_time + validity
            },
          }
        and {
          // Owner preserved
          output_datum.owner == input_datum.owner,
          // Delegate added correctly
          output_datum.delegates == add_delegate(
            input_datum.delegates,
            new_delegate,
          ),
          // Attributes preserved
          output_datum.attributes == input_datum.attributes,
        }
      }

      RevokeDelegate { delegate_type, delegate } ->
        and {
          // Owner preserved
          output_datum.owner == input_datum.owner,
          // Delegate removed
          output_datum.delegates == remove_delegate(
            input_datum.delegates,
            delegate_type,
            delegate,
          ),
          // Delegate must have existed
          delegate_exists(input_datum.delegates, delegate_type, delegate),
          // Attributes preserved
          output_datum.attributes == input_datum.attributes,
        }

      SetAttribute { name, value, validity } -> {
        let new_attribute =
          Attribute {
            name,
            value,
            valid_until: if validity == 0 {
              0
            } else {
              current_time + validity
            },
          }
        and {
          // Owner preserved
          output_datum.owner == input_datum.owner,
          // Delegates preserved
          output_datum.delegates == input_datum.delegates,
          // Attribute added/updated correctly
          output_datum.attributes == set_attribute(
            input_datum.attributes,
            new_attribute,
          ),
        }
      }

      RevokeAttribute { name, value } ->
        and {
          // Owner preserved
          output_datum.owner == input_datum.owner,
          // Delegates preserved
          output_datum.delegates == input_datum.delegates,
          // Attribute removed
          output_datum.attributes == remove_attribute(
            input_datum.attributes,
            name,
            value,
          ),
          // Attribute must have existed
          attribute_exists(input_datum.attributes, name, value),
        }
    }

  identity_preserved && nonce_incremented && action_valid
}

// ============================================================================
// IDENTITY VALIDATOR
// ============================================================================

/// Identity Spend Validator
///
/// This validator controls spending of identity UTXOs. It ensures that only
/// the owner can modify identity state, and that all state transitions
/// follow the correct rules.
///
/// # Parameters
/// * `nft_policy_id` - The policy ID of the identity NFT minting policy
/// * `identity_token_name` - The token name of this identity's NFT
///
/// # Security Properties
/// * Only the owner can perform any action
/// * Identity field is immutable
/// * Nonce always increments (replay protection)
/// * Identity NFT must be preserved in continuing output
validator identity(nft_policy_id: PolicyId, identity_token_name: ByteArray) {
  spend(
    datum_opt: Option<IdentityDatum>,
    redeemer: IdentityAction,
    utxo: OutputReference,
    tx: Transaction,
  ) {
    let Transaction { inputs, outputs, extra_signatories, validity_range, .. } =
      tx

    // Extract and validate the input datum
    expect Some(input_datum) = datum_opt

    // Find the input being spent
    expect Some(spent_input) = find_input(inputs, utxo)
    let own_address = spent_input.output.address

    // Get current time from validity range (using lower bound for safety)
    let current_time = get_validity_lower_bound(validity_range)

    // Owner must sign all transactions
    expect key_signed(extra_signatories, input_datum.owner)

    // Find the continuing output with the identity NFT
    expect Some(continuing_output) =
      find_continuing_output(
        outputs,
        own_address,
        nft_policy_id,
        identity_token_name,
      )

    // Extract output datum
    expect InlineDatum(output_datum_data) = continuing_output.datum
    expect output_datum: IdentityDatum = output_datum_data

    // Validate the datum transition
    validate_datum_transition(input_datum, output_datum, redeemer, current_time)
  }

  else(_) {
    fail
  }
}

// ============================================================================
// PUBLIC QUERY FUNCTIONS (for off-chain use via read)
// ============================================================================

/// Checks if a delegate is currently valid for an identity.
/// This function can be used off-chain to verify delegate authorization.
///
/// # Arguments
/// * `datum` - The identity datum
/// * `delegate_type` - The type of delegation to check
/// * `delegate_address` - The delegate's address
/// * `current_time` - Current POSIX timestamp in milliseconds
///
/// # Returns
/// True if the delegate is valid, False otherwise
pub fn is_valid_delegate(
  datum: IdentityDatum,
  delegate_type: ByteArray,
  delegate_address: VerificationKeyHash,
  current_time: Int,
) -> Bool {
  list.any(
    datum.delegates,
    fn(d) {
      let type_matches = d.delegate_type == delegate_type
      let address_matches = d.delegate_address == delegate_address
      let not_expired = d.valid_until == 0 || d.valid_until > current_time
      type_matches && address_matches && not_expired
    },
  )
}

/// Gets the current owner of an identity.
///
/// # Arguments
/// * `datum` - The identity datum
///
/// # Returns
/// The owner's verification key hash
pub fn get_identity_owner(datum: IdentityDatum) -> VerificationKeyHash {
  datum.owner
}

/// Gets all valid delegates for an identity at a given time.
///
/// # Arguments
/// * `datum` - The identity datum
/// * `current_time` - Current POSIX timestamp in milliseconds
///
/// # Returns
/// List of currently valid delegates
pub fn get_valid_delegates(
  datum: IdentityDatum,
  current_time: Int,
) -> List<Delegate> {
  list.filter(
    datum.delegates,
    fn(d) { d.valid_until == 0 || d.valid_until > current_time },
  )
}

/// Gets all valid attributes for an identity at a given time.
///
/// # Arguments
/// * `datum` - The identity datum
/// * `current_time` - Current POSIX timestamp in milliseconds
///
/// # Returns
/// List of currently valid attributes
pub fn get_valid_attributes(
  datum: IdentityDatum,
  current_time: Int,
) -> List<Attribute> {
  list.filter(
    datum.attributes,
    fn(a) { a.valid_until == 0 || a.valid_until > current_time },
  )
}
