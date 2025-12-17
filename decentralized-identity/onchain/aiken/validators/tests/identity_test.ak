//// Decentralized Identity - Unit Tests
////
//// Comprehensive tests for the identity validators using mocktail.

use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval.{Finite, Interval, IntervalBound}
use cardano/address.{Address, Credential, Script, VerificationKey}
use cardano/assets.{add, from_asset, zero}
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
}
use identity.{
  get_identity_owner, get_valid_attributes, get_valid_delegates,
  is_valid_delegate,
}
use identity_nft.{compute_identity_token_name}
use types.{
  AddDelegate, Attribute, ChangeOwner, CreateIdentity, Delegate,
  IdentityAction, IdentityDatum, MintAction, RevokeAttribute, RevokeDelegate,
  SetAttribute, delegate_type_sig_auth, delegate_type_veri_key,
}

// ============================================================================
// TEST CONSTANTS
// ============================================================================

const test_policy_id: ByteArray =
  #"0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab"

const test_identity_pkh: VerificationKeyHash =
  #"1111111111111111111111111111111111111111111111111111111111111111"

const test_owner_pkh: VerificationKeyHash =
  #"2222222222222222222222222222222222222222222222222222222222222222"

const test_new_owner_pkh: VerificationKeyHash =
  #"3333333333333333333333333333333333333333333333333333333333333333"

const test_delegate_pkh: VerificationKeyHash =
  #"4444444444444444444444444444444444444444444444444444444444444444"

const test_tx_hash: ByteArray =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fn make_test_address(pkh: VerificationKeyHash) -> Address {
  Address {
    payment_credential: VerificationKey(pkh),
    stake_credential: None,
  }
}

fn make_script_address(script_hash: ByteArray) -> Address {
  Address {
    payment_credential: Script(script_hash),
    stake_credential: None,
  }
}

fn make_test_utxo_ref(index: Int) -> OutputReference {
  OutputReference { transaction_id: test_tx_hash, output_index: index }
}

fn make_validity_range(lower: Int, upper: Int) -> Interval<Int> {
  Interval {
    lower_bound: IntervalBound { bound_type: Finite(lower), is_inclusive: True },
    upper_bound: IntervalBound { bound_type: Finite(upper), is_inclusive: True },
  }
}

fn make_base_identity_datum() -> IdentityDatum {
  IdentityDatum {
    identity: test_identity_pkh,
    owner: test_owner_pkh,
    delegates: [],
    attributes: [],
    nonce: 0,
  }
}

fn make_identity_datum_with_delegate(
  delegate: VerificationKeyHash,
  dtype: ByteArray,
  valid_until: Int,
) -> IdentityDatum {
  IdentityDatum {
    identity: test_identity_pkh,
    owner: test_owner_pkh,
    delegates: [
      Delegate {
        delegate_address: delegate,
        delegate_type: dtype,
        valid_until: valid_until,
      },
    ],
    attributes: [],
    nonce: 1,
  }
}

fn make_identity_datum_with_attribute(
  name: ByteArray,
  value: ByteArray,
  valid_until: Int,
) -> IdentityDatum {
  IdentityDatum {
    identity: test_identity_pkh,
    owner: test_owner_pkh,
    delegates: [],
    attributes: [Attribute { name, value, valid_until }],
    nonce: 1,
  }
}

// ============================================================================
// TOKEN NAME COMPUTATION TESTS
// ============================================================================

test compute_token_name_deterministic() {
  let utxo_ref = make_test_utxo_ref(0)
  let token_name1 = compute_identity_token_name(utxo_ref)
  let token_name2 = compute_identity_token_name(utxo_ref)
  token_name1 == token_name2
}

test compute_token_name_different_for_different_utxos() {
  let utxo_ref1 = make_test_utxo_ref(0)
  let utxo_ref2 = make_test_utxo_ref(1)
  let token_name1 = compute_identity_token_name(utxo_ref1)
  let token_name2 = compute_identity_token_name(utxo_ref2)
  token_name1 != token_name2
}

test compute_token_name_is_32_bytes() {
  let utxo_ref = make_test_utxo_ref(0)
  let token_name = compute_identity_token_name(utxo_ref)
  builtin.length_of_bytearray(token_name) == 32
}

// ============================================================================
// DELEGATE VALIDITY TESTS
// ============================================================================

test is_valid_delegate_returns_true_for_valid_delegate() {
  let datum =
    make_identity_datum_with_delegate(
      test_delegate_pkh,
      delegate_type_veri_key,
      1000000,
    )
  let current_time = 500000
  is_valid_delegate(
    datum,
    delegate_type_veri_key,
    test_delegate_pkh,
    current_time,
  )
}

test is_valid_delegate_returns_false_for_expired_delegate() {
  let datum =
    make_identity_datum_with_delegate(
      test_delegate_pkh,
      delegate_type_veri_key,
      500000,
    )
  let current_time = 1000000
  !is_valid_delegate(
    datum,
    delegate_type_veri_key,
    test_delegate_pkh,
    current_time,
  )
}

test is_valid_delegate_returns_true_for_permanent_delegate() {
  // valid_until = 0 means permanent
  let datum =
    make_identity_datum_with_delegate(test_delegate_pkh, delegate_type_veri_key, 0)
  let current_time = 999999999999
  is_valid_delegate(
    datum,
    delegate_type_veri_key,
    test_delegate_pkh,
    current_time,
  )
}

test is_valid_delegate_returns_false_for_wrong_type() {
  let datum =
    make_identity_datum_with_delegate(
      test_delegate_pkh,
      delegate_type_veri_key,
      1000000,
    )
  let current_time = 500000
  !is_valid_delegate(
    datum,
    delegate_type_sig_auth,
    test_delegate_pkh,
    current_time,
  )
}

test is_valid_delegate_returns_false_for_wrong_address() {
  let datum =
    make_identity_datum_with_delegate(
      test_delegate_pkh,
      delegate_type_veri_key,
      1000000,
    )
  let current_time = 500000
  !is_valid_delegate(
    datum,
    delegate_type_veri_key,
    test_new_owner_pkh,
    current_time,
  )
}

test is_valid_delegate_returns_false_for_empty_delegates() {
  let datum = make_base_identity_datum()
  let current_time = 500000
  !is_valid_delegate(
    datum,
    delegate_type_veri_key,
    test_delegate_pkh,
    current_time,
  )
}

// ============================================================================
// OWNER QUERY TESTS
// ============================================================================

test get_identity_owner_returns_correct_owner() {
  let datum = make_base_identity_datum()
  get_identity_owner(datum) == test_owner_pkh
}

test get_identity_owner_after_ownership_change() {
  let datum =
    IdentityDatum {
      identity: test_identity_pkh,
      owner: test_new_owner_pkh,
      delegates: [],
      attributes: [],
      nonce: 1,
    }
  get_identity_owner(datum) == test_new_owner_pkh
}

// ============================================================================
// VALID DELEGATES QUERY TESTS
// ============================================================================

test get_valid_delegates_filters_expired() {
  let datum =
    IdentityDatum {
      identity: test_identity_pkh,
      owner: test_owner_pkh,
      delegates: [
        Delegate {
          delegate_address: test_delegate_pkh,
          delegate_type: delegate_type_veri_key,
          valid_until: 500000,
        },
        Delegate {
          delegate_address: test_new_owner_pkh,
          delegate_type: delegate_type_sig_auth,
          valid_until: 1500000,
        },
      ],
      attributes: [],
      nonce: 2,
    }
  let current_time = 1000000
  let valid = get_valid_delegates(datum, current_time)
  list.length(valid) == 1
}

test get_valid_delegates_includes_permanent() {
  let datum =
    IdentityDatum {
      identity: test_identity_pkh,
      owner: test_owner_pkh,
      delegates: [
        Delegate {
          delegate_address: test_delegate_pkh,
          delegate_type: delegate_type_veri_key,
          valid_until: 0,
        },
      ],
      attributes: [],
      nonce: 1,
    }
  let current_time = 999999999999
  let valid = get_valid_delegates(datum, current_time)
  list.length(valid) == 1
}

test get_valid_delegates_returns_empty_when_none() {
  let datum = make_base_identity_datum()
  let current_time = 1000000
  let valid = get_valid_delegates(datum, current_time)
  list.is_empty(valid)
}

// ============================================================================
// VALID ATTRIBUTES QUERY TESTS
// ============================================================================

test get_valid_attributes_filters_expired() {
  let datum =
    IdentityDatum {
      identity: test_identity_pkh,
      owner: test_owner_pkh,
      delegates: [],
      attributes: [
        Attribute { name: "attr1", value: "value1", valid_until: 500000 },
        Attribute { name: "attr2", value: "value2", valid_until: 1500000 },
      ],
      nonce: 2,
    }
  let current_time = 1000000
  let valid = get_valid_attributes(datum, current_time)
  list.length(valid) == 1
}

test get_valid_attributes_includes_permanent() {
  let datum = make_identity_datum_with_attribute("name", "value", 0)
  let current_time = 999999999999
  let valid = get_valid_attributes(datum, current_time)
  list.length(valid) == 1
}

test get_valid_attributes_returns_empty_when_none() {
  let datum = make_base_identity_datum()
  let current_time = 1000000
  let valid = get_valid_attributes(datum, current_time)
  list.is_empty(valid)
}

// ============================================================================
// DATUM STRUCTURE TESTS
// ============================================================================

test identity_datum_preserves_identity_field() {
  let datum = make_base_identity_datum()
  datum.identity == test_identity_pkh
}

test identity_datum_owner_can_differ_from_identity() {
  let datum = make_base_identity_datum()
  datum.identity != datum.owner
}

test identity_datum_nonce_starts_at_zero() {
  let datum = make_base_identity_datum()
  datum.nonce == 0
}

test identity_datum_delegates_initially_empty() {
  let datum = make_base_identity_datum()
  list.is_empty(datum.delegates)
}

test identity_datum_attributes_initially_empty() {
  let datum = make_base_identity_datum()
  list.is_empty(datum.attributes)
}

// ============================================================================
// DELEGATE TYPE CONSTANT TESTS
// ============================================================================

test delegate_type_veri_key_is_correct() {
  delegate_type_veri_key == "veriKey"
}

test delegate_type_sig_auth_is_correct() {
  delegate_type_sig_auth == "sigAuth"
}

// ============================================================================
// ACTION TYPE TESTS
// ============================================================================

test change_owner_action_contains_new_owner() {
  let action = ChangeOwner { new_owner: test_new_owner_pkh }
  when action is {
    ChangeOwner { new_owner } -> new_owner == test_new_owner_pkh
    _ -> False
  }
}

test add_delegate_action_contains_all_fields() {
  let action =
    AddDelegate {
      delegate_type: delegate_type_veri_key,
      delegate: test_delegate_pkh,
      validity: 86400000,
    }
  when action is {
    AddDelegate { delegate_type, delegate, validity } ->
      delegate_type == delegate_type_veri_key && delegate == test_delegate_pkh && validity == 86400000
    _ -> False
  }
}

test revoke_delegate_action_contains_all_fields() {
  let action =
    RevokeDelegate {
      delegate_type: delegate_type_veri_key,
      delegate: test_delegate_pkh,
    }
  when action is {
    RevokeDelegate { delegate_type, delegate } ->
      delegate_type == delegate_type_veri_key && delegate == test_delegate_pkh
    _ -> False
  }
}

test set_attribute_action_contains_all_fields() {
  let action = SetAttribute { name: "test", value: "value", validity: 0 }
  when action is {
    SetAttribute { name, value, validity } ->
      name == "test" && value == "value" && validity == 0
    _ -> False
  }
}

test revoke_attribute_action_contains_all_fields() {
  let action = RevokeAttribute { name: "test", value: "value" }
  when action is {
    RevokeAttribute { name, value } -> name == "test" && value == "value"
    _ -> False
  }
}

// ============================================================================
// MINT ACTION TESTS
// ============================================================================

test create_identity_action_matches() {
  let action: MintAction = CreateIdentity
  when action is {
    CreateIdentity -> True
    _ -> False
  }
}

test destroy_identity_action_matches() {
  let action: MintAction = types.DestroyIdentity
  when action is {
    types.DestroyIdentity -> True
    _ -> False
  }
}
