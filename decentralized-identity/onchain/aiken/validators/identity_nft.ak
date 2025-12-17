//// Decentralized Identity - NFT Minting Policy
////
//// This validator implements a one-shot minting policy for identity NFTs.
//// Each identity is represented by a unique NFT that can only be minted once,
//// ensuring global uniqueness of identity tokens.

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash, sha2_256}
use aiken/primitive/bytearray
use cardano/address.{Script}
use cardano/assets.{PolicyId, flatten, tokens}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction,
}
use cocktail/vodka_extra_signatories.{key_signed}
use types.{CreateIdentity, DestroyIdentity, IdentityDatum, MintAction}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Computes the unique token name for an identity NFT.
/// The token name is derived from the UTXO being consumed during minting,
/// guaranteeing uniqueness through the one-shot pattern.
///
/// # Arguments
/// * `utxo_ref` - The output reference of the UTXO being consumed
///
/// # Returns
/// A 32-byte hash serving as the unique token name
pub fn compute_identity_token_name(utxo_ref: OutputReference) -> ByteArray {
  let OutputReference { transaction_id, output_index } = utxo_ref
  // Combine tx hash and output index, then hash for consistent 32-byte name
  sha2_256(bytearray.concat(transaction_id, bytearray.from_int_big_endian(output_index, 4)))
}

/// Checks if a specific UTXO is consumed in the transaction inputs.
///
/// # Arguments
/// * `inputs` - List of transaction inputs
/// * `utxo_ref` - The output reference to search for
///
/// # Returns
/// True if the UTXO is consumed, False otherwise
fn is_utxo_consumed(inputs: List<Input>, utxo_ref: OutputReference) -> Bool {
  list.any(inputs, fn(input) { input.output_reference == utxo_ref })
}

/// Validates that exactly the expected amount of identity tokens are minted.
///
/// # Arguments
/// * `mint` - The mint field from the transaction
/// * `policy_id` - The policy ID of this minting policy
/// * `expected_token_name` - The expected token name
/// * `expected_amount` - The expected mint amount (+1 for mint, -1 for burn)
///
/// # Returns
/// True if the mint is valid, False otherwise
fn validate_mint_amount(
  mint: cardano/assets.Value,
  policy_id: PolicyId,
  expected_token_name: ByteArray,
  expected_amount: Int,
) -> Bool {
  let minted_tokens = tokens(mint, policy_id) |> dict.to_pairs()
  when minted_tokens is {
    [(token_name, amount)] ->
      token_name == expected_token_name && amount == expected_amount
    _ -> False
  }
}

/// Validates the output going to the identity script.
///
/// # Arguments
/// * `outputs` - Transaction outputs
/// * `policy_id` - The policy ID of the identity NFT
/// * `token_name` - The identity token name
/// * `expected_identity` - The expected identity address in the datum
///
/// # Returns
/// True if there's exactly one valid output with correct datum
fn validate_identity_output(
  outputs: List<Output>,
  policy_id: PolicyId,
  token_name: ByteArray,
  expected_identity: VerificationKeyHash,
) -> Bool {
  // Find outputs that contain the identity NFT
  let identity_outputs =
    list.filter(
      outputs,
      fn(output) {
        let output_tokens = tokens(output.value, policy_id) |> dict.to_pairs()
        list.any(output_tokens, fn(pair) { pair.1st == token_name && pair.2nd == 1 })
      },
    )

  when identity_outputs is {
    [output] -> {
      // Verify the output has inline datum with correct identity
      when output.datum is {
        InlineDatum(datum_data) -> {
          expect datum: IdentityDatum = datum_data
          and {
            // Identity field must match expected identity
            datum.identity == expected_identity,
            // Owner must match identity (self-sovereign at creation)
            datum.owner == expected_identity,
            // Delegates should be empty at creation
            list.is_empty(datum.delegates),
            // Nonce must start at 0
            datum.nonce == 0,
          }
        }
        _ -> False
      }
    }
    _ -> False
  }
}

// ============================================================================
// MINTING POLICY VALIDATOR
// ============================================================================

/// Identity NFT Minting Policy
///
/// This validator uses the one-shot minting pattern to create unique identity
/// tokens. The token name is derived from a specific UTXO that must be consumed
/// during the minting transaction, guaranteeing that the token can only be
/// minted once.
///
/// # Parameters
/// * `utxo_ref` - The output reference that must be consumed to mint
/// * `identity_validator_hash` - The hash of the identity spend validator
///
/// # Redeemer
/// * `CreateIdentity` - Mint a new identity NFT
/// * `DestroyIdentity` - Burn an existing identity NFT
validator identity_nft(
  utxo_ref: OutputReference,
  identity_validator_hash: ByteArray,
) {
  mint(redeemer: MintAction, policy_id: PolicyId, tx: Transaction) {
    let Transaction { inputs, outputs, mint, extra_signatories, .. } = tx

    // Compute the deterministic token name from the parameterized UTXO
    let identity_token_name = compute_identity_token_name(utxo_ref)

    when redeemer is {
      CreateIdentity -> {
        // For creation, the parameterized UTXO must be consumed
        expect is_utxo_consumed(inputs, utxo_ref)

        // Find the consumed UTXO to get the identity address
        expect Some(consumed_input) =
          list.find(inputs, fn(input) { input.output_reference == utxo_ref })

        // Extract the identity (the address that owns the consumed UTXO)
        expect cardano/address.Credential.VerificationKey(identity_pkh) =
          consumed_input.output.address.payment_credential

        // Validate exactly 1 identity token is minted
        expect
          validate_mint_amount(mint, policy_id, identity_token_name, 1)

        // Validate the output goes to the identity validator with correct datum
        // The output must be at the identity validator script address
        let valid_outputs =
          list.filter(
            outputs,
            fn(output) {
              when output.address.payment_credential is {
                Script(script_hash) -> script_hash == identity_validator_hash
                _ -> False
              }
            },
          )

        // Verify there's exactly one output to the identity validator
        expect [identity_output] = valid_outputs

        // Verify the identity output contains the NFT
        let output_has_nft = {
          let output_tokens =
            tokens(identity_output.value, policy_id) |> dict.to_pairs()
          list.any(
            output_tokens,
            fn(pair) { pair.1st == identity_token_name && pair.2nd == 1 },
          )
        }
        expect output_has_nft

        // Verify the datum is correctly initialized
        expect InlineDatum(datum_data) = identity_output.datum
        expect datum: IdentityDatum = datum_data

        and {
          // Identity field must be the consumed UTXO owner
          datum.identity == identity_pkh,
          // Owner must be the identity (self-sovereign at creation)
          datum.owner == identity_pkh,
          // Delegates should be empty at creation
          list.is_empty(datum.delegates),
          // Nonce must start at 0
          datum.nonce == 0,
          // The identity creator must sign
          key_signed(extra_signatories, identity_pkh),
        }
      }

      DestroyIdentity -> {
        // For destruction, exactly 1 identity token must be burned
        validate_mint_amount(mint, policy_id, identity_token_name, -1)
        // Note: The spend validator handles additional destruction logic
      }
    }
  }

  else(_) {
    fail
  }
}
