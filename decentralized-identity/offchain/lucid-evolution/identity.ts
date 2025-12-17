/**
 * Decentralized Identity - Lucid Evolution Off-chain Implementation
 *
 * This module provides functions to interact with the decentralized identity
 * smart contracts on Cardano. It implements EIP-1056 style identity management
 * including identity creation, ownership transfer, delegate management, and
 * attribute storage.
 *
 * @module identity
 */

import {
  Lucid,
  Koios,
  Blockfrost,
  generateSeedPhrase,
  validatorToAddress,
  getAddressDetails,
  Data,
  LucidEvolution,
  applyParamsToScript,
  Constr,
  validatorToScriptHash,
  Script,
  Redeemer,
  toUnit,
  UTxO,
  Network,
  fromText,
  toText,
} from "@evolution-sdk/lucid";
import { encodeHex, decodeHex } from "@std/encoding/hex";
import { sha256 } from "@noble/hashes/sha2";

// Import blueprint after building with `aiken build`
// import blueprint from "../../onchain/aiken/plutus.json" with { type: "json" };

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Delegate type constants following EIP-1056 conventions
 */
export const DelegateType = {
  /** Verification key for off-chain signature verification */
  VERI_KEY: "veriKey",
  /** Signature authentication for on-chain authorization */
  SIG_AUTH: "sigAuth",
  /** Encryption key for key agreement */
  ENC: "enc",
} as const;

/**
 * Represents a delegate authorized to act on behalf of an identity
 */
export interface Delegate {
  delegateAddress: string;
  delegateType: string;
  validUntil: bigint;
}

/**
 * Represents an identity attribute
 */
export interface Attribute {
  name: string;
  value: string;
  validUntil: bigint;
}

/**
 * Identity datum structure stored on-chain
 */
export interface IdentityDatum {
  identity: string;
  owner: string;
  delegates: Delegate[];
  attributes: Attribute[];
  nonce: bigint;
}

/**
 * Configuration for the identity contract
 */
export interface IdentityConfig {
  network: Network;
  provider: "koios" | "blockfrost";
  apiUrl?: string;
  apiKey?: string;
}

// ============================================================================
// SCHEMA DEFINITIONS FOR DATA SERIALIZATION
// ============================================================================

/**
 * Schema for Delegate type
 */
const DelegateSchema = Data.Object({
  delegate_address: Data.Bytes(),
  delegate_type: Data.Bytes(),
  valid_until: Data.Integer(),
});

/**
 * Schema for Attribute type
 */
const AttributeSchema = Data.Object({
  name: Data.Bytes(),
  value: Data.Bytes(),
  valid_until: Data.Integer(),
});

/**
 * Schema for IdentityDatum
 */
const IdentityDatumSchema = Data.Object({
  identity: Data.Bytes(),
  owner: Data.Bytes(),
  delegates: Data.Array(DelegateSchema),
  attributes: Data.Array(AttributeSchema),
  nonce: Data.Integer(),
});

type IdentityDatumType = Data.Static<typeof IdentityDatumSchema>;
const IdentityDatumType = IdentityDatumSchema as unknown as IdentityDatumType;

/**
 * Schema for ChangeOwner action
 */
const ChangeOwnerSchema = Data.Object({
  new_owner: Data.Bytes(),
});

/**
 * Schema for AddDelegate action
 */
const AddDelegateSchema = Data.Object({
  delegate_type: Data.Bytes(),
  delegate: Data.Bytes(),
  validity: Data.Integer(),
});

/**
 * Schema for RevokeDelegate action
 */
const RevokeDelegateSchema = Data.Object({
  delegate_type: Data.Bytes(),
  delegate: Data.Bytes(),
});

/**
 * Schema for SetAttribute action
 */
const SetAttributeSchema = Data.Object({
  name: Data.Bytes(),
  value: Data.Bytes(),
  validity: Data.Integer(),
});

/**
 * Schema for RevokeAttribute action
 */
const RevokeAttributeSchema = Data.Object({
  name: Data.Bytes(),
  value: Data.Bytes(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Computes the deterministic token name for an identity NFT
 * based on the UTXO reference used for one-shot minting.
 *
 * @param txHash - Transaction hash of the UTXO
 * @param outputIndex - Output index of the UTXO
 * @returns Hex-encoded 32-byte token name
 */
export function computeIdentityTokenName(
  txHash: string,
  outputIndex: number
): string {
  const txHashBytes = decodeHex(txHash);
  const outputIndexBytes = new Uint8Array(4);
  new DataView(outputIndexBytes.buffer).setUint32(0, outputIndex, false);
  const combined = new Uint8Array(txHashBytes.length + 4);
  combined.set(txHashBytes, 0);
  combined.set(outputIndexBytes, txHashBytes.length);
  return encodeHex(sha256(combined));
}

/**
 * Parses an on-chain datum into an IdentityDatum object
 *
 * @param datumData - Raw datum data from the chain
 * @returns Parsed IdentityDatum
 */
export function parseIdentityDatum(datumData: string): IdentityDatum {
  const datum = Data.from(datumData, IdentityDatumType);
  return {
    identity: datum.identity,
    owner: datum.owner,
    delegates: datum.delegates.map((d: any) => ({
      delegateAddress: d.delegate_address,
      delegateType: toText(d.delegate_type),
      validUntil: d.valid_until,
    })),
    attributes: datum.attributes.map((a: any) => ({
      name: toText(a.name),
      value: toText(a.value),
      validUntil: a.valid_until,
    })),
    nonce: datum.nonce,
  };
}

/**
 * Checks if a delegate is currently valid
 *
 * @param delegate - The delegate to check
 * @param currentTime - Current POSIX timestamp in milliseconds
 * @returns True if delegate is valid
 */
export function isDelegateValid(
  delegate: Delegate,
  currentTime: bigint
): boolean {
  return delegate.validUntil === 0n || delegate.validUntil > currentTime;
}

/**
 * Checks if an attribute is currently valid
 *
 * @param attribute - The attribute to check
 * @param currentTime - Current POSIX timestamp in milliseconds
 * @returns True if attribute is valid
 */
export function isAttributeValid(
  attribute: Attribute,
  currentTime: bigint
): boolean {
  return attribute.validUntil === 0n || attribute.validUntil > currentTime;
}

// ============================================================================
// IDENTITY CONTRACT CLASS
// ============================================================================

/**
 * Main class for interacting with the Decentralized Identity smart contracts.
 *
 * @example
 * ```typescript
 * const identity = new DecentralizedIdentity({
 *   network: "Preprod",
 *   provider: "koios",
 * });
 * await identity.initialize();
 * const txHash = await identity.createIdentity();
 * ```
 */
export class DecentralizedIdentity {
  private lucid!: LucidEvolution;
  private config: IdentityConfig;
  private identityNftPolicy!: Script;
  private identityValidator!: Script;
  private identityNftPolicyId!: string;
  private identityValidatorHash!: string;
  private identityValidatorAddress!: string;

  /**
   * Creates a new DecentralizedIdentity instance
   *
   * @param config - Configuration options
   */
  constructor(config: IdentityConfig) {
    this.config = config;
  }

  /**
   * Initializes the Lucid instance and loads the contract scripts.
   * Must be called before using other methods.
   */
  async initialize(): Promise<void> {
    // Initialize Lucid with the configured provider
    if (this.config.provider === "koios") {
      const apiUrl =
        this.config.apiUrl ||
        (this.config.network === "Mainnet"
          ? "https://api.koios.rest/api/v1"
          : "https://preprod.koios.rest/api/v1");
      this.lucid = await Lucid(new Koios(apiUrl), this.config.network);
    } else {
      if (!this.config.apiKey) {
        throw new Error("Blockfrost API key is required");
      }
      this.lucid = await Lucid(
        new Blockfrost(
          this.config.apiUrl || `https://cardano-${this.config.network.toLowerCase()}.blockfrost.io/api/v0`,
          this.config.apiKey
        ),
        this.config.network
      );
    }

    // Note: In production, load these from the compiled plutus.json
    // For now, we'll create placeholders that would be replaced with actual compiled code
    console.log("Identity contract initialized. Load blueprint after building with 'aiken build'");
  }

  /**
   * Loads validator scripts from the compiled blueprint
   *
   * @param blueprint - The compiled plutus.json blueprint
   * @param utxoRef - UTXO reference for parameterizing the NFT policy
   */
  loadValidators(
    blueprint: any,
    utxoRef: { txHash: string; outputIndex: number }
  ): void {
    // Find and parameterize the identity NFT minting policy
    const nftValidator = blueprint.validators.find(
      (v: any) => v.title === "identity_nft.identity_nft"
    );
    if (!nftValidator) {
      throw new Error("Identity NFT validator not found in blueprint");
    }

    // Find the identity spend validator
    const spendValidator = blueprint.validators.find(
      (v: any) => v.title === "identity.identity"
    );
    if (!spendValidator) {
      throw new Error("Identity validator not found in blueprint");
    }

    // Get the identity validator hash first (needed for NFT policy parameter)
    const tempIdentityValidator: Script = {
      type: "PlutusV3",
      script: spendValidator.compiledCode,
    };
    this.identityValidatorHash = validatorToScriptHash(tempIdentityValidator);

    // Create the output reference for parameterization
    const outputReference = new Constr(0, [
      utxoRef.txHash,
      BigInt(utxoRef.outputIndex),
    ]);

    // Apply parameters to the NFT policy
    this.identityNftPolicy = {
      type: "PlutusV3",
      script: applyParamsToScript(nftValidator.compiledCode, [
        outputReference,
        this.identityValidatorHash,
      ]),
    };
    this.identityNftPolicyId = validatorToScriptHash(this.identityNftPolicy);

    // Compute the identity token name
    const tokenName = computeIdentityTokenName(
      utxoRef.txHash,
      utxoRef.outputIndex
    );

    // Apply parameters to the identity validator
    this.identityValidator = {
      type: "PlutusV3",
      script: applyParamsToScript(spendValidator.compiledCode, [
        this.identityNftPolicyId,
        tokenName,
      ]),
    };
    this.identityValidatorHash = validatorToScriptHash(this.identityValidator);
    this.identityValidatorAddress = validatorToAddress(
      this.config.network,
      this.identityValidator
    );
  }

  /**
   * Selects a wallet from a seed phrase
   *
   * @param seedPhrase - BIP39 seed phrase
   */
  selectWalletFromSeed(seedPhrase: string): void {
    this.lucid.selectWallet.fromSeed(seedPhrase);
  }

  /**
   * Generates a new wallet and returns the seed phrase
   *
   * @returns Generated BIP39 seed phrase
   */
  generateWallet(): string {
    const seedPhrase = generateSeedPhrase();
    this.lucid.selectWallet.fromSeed(seedPhrase);
    return seedPhrase;
  }

  /**
   * Gets the current wallet address
   *
   * @returns Wallet address
   */
  async getWalletAddress(): Promise<string> {
    return await this.lucid.wallet().address();
  }

  /**
   * Creates a new decentralized identity.
   * This mints a unique identity NFT and creates the identity UTXO.
   *
   * @param blueprint - Compiled plutus.json
   * @returns Transaction hash
   */
  async createIdentity(blueprint: any): Promise<string> {
    const address = await this.lucid.wallet().address();
    const { paymentCredential } = getAddressDetails(address);
    if (!paymentCredential) {
      throw new Error("Could not get payment credential from wallet address");
    }

    // Find a suitable UTXO to use as the one-shot reference
    const utxos = await this.lucid.utxosAt(address);
    const selectedUtxo = utxos.find(
      (utxo) => utxo.assets.lovelace > 5_000_000n
    );
    if (!selectedUtxo) {
      throw new Error("No suitable UTXO found for identity creation");
    }

    // Load validators with this UTXO
    this.loadValidators(blueprint, {
      txHash: selectedUtxo.txHash,
      outputIndex: selectedUtxo.outputIndex,
    });

    // Compute the identity token name
    const tokenName = computeIdentityTokenName(
      selectedUtxo.txHash,
      selectedUtxo.outputIndex
    );

    // Create the initial datum
    const initialDatum = Data.to(
      {
        identity: paymentCredential.hash,
        owner: paymentCredential.hash,
        delegates: [],
        attributes: [],
        nonce: 0n,
      },
      IdentityDatumType
    );

    // Build the transaction
    const tx = await this.lucid
      .newTx()
      .collectFrom([selectedUtxo])
      .attach.MintingPolicy(this.identityNftPolicy)
      .mintAssets(
        { [toUnit(this.identityNftPolicyId, tokenName)]: 1n },
        Data.to(new Constr(0, [])) // CreateIdentity redeemer
      )
      .pay.ToContract(
        this.identityValidatorAddress,
        { kind: "inline", value: initialDatum },
        { [toUnit(this.identityNftPolicyId, tokenName)]: 1n }
      )
      .addSigner(address)
      .complete();

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    console.log(`Identity created successfully!`);
    console.log(`Transaction hash: ${txHash}`);
    console.log(`Identity NFT Policy ID: ${this.identityNftPolicyId}`);
    console.log(`Identity Token Name: ${tokenName}`);
    console.log(`Identity Validator Address: ${this.identityValidatorAddress}`);

    return txHash;
  }

  /**
   * Finds the identity UTXO for a given identity
   *
   * @returns The identity UTXO or null if not found
   */
  async findIdentityUtxo(): Promise<UTxO | null> {
    if (!this.identityValidatorAddress) {
      throw new Error("Validators not loaded. Call loadValidators first.");
    }

    const utxos = await this.lucid.utxosAt(this.identityValidatorAddress);

    // Find UTXO with the identity NFT
    for (const utxo of utxos) {
      const hasNft = Object.keys(utxo.assets).some((unit) =>
        unit.startsWith(this.identityNftPolicyId)
      );
      if (hasNft && utxo.datum) {
        return utxo;
      }
    }

    return null;
  }

  /**
   * Gets the current identity datum
   *
   * @returns Parsed identity datum or null
   */
  async getIdentityDatum(): Promise<IdentityDatum | null> {
    const utxo = await this.findIdentityUtxo();
    if (!utxo || !utxo.datum) {
      return null;
    }
    return parseIdentityDatum(utxo.datum);
  }

  /**
   * Changes the owner of the identity
   *
   * @param newOwnerPkh - Public key hash of the new owner
   * @returns Transaction hash
   */
  async changeOwner(newOwnerPkh: string): Promise<string> {
    const address = await this.lucid.wallet().address();
    const utxo = await this.findIdentityUtxo();
    if (!utxo || !utxo.datum) {
      throw new Error("Identity UTXO not found");
    }

    const currentDatum = parseIdentityDatum(utxo.datum);
    const tokenName = Object.keys(utxo.assets)
      .find((unit) => unit.startsWith(this.identityNftPolicyId))
      ?.slice(56);
    if (!tokenName) {
      throw new Error("Identity NFT not found in UTXO");
    }

    // Create the new datum with updated owner
    const newDatum = Data.to(
      {
        identity: currentDatum.identity,
        owner: newOwnerPkh,
        delegates: currentDatum.delegates.map((d) => ({
          delegate_address: d.delegateAddress,
          delegate_type: fromText(d.delegateType),
          valid_until: d.validUntil,
        })),
        attributes: currentDatum.attributes.map((a) => ({
          name: fromText(a.name),
          value: fromText(a.value),
          valid_until: a.validUntil,
        })),
        nonce: currentDatum.nonce + 1n,
      },
      IdentityDatumType
    );

    // Create the redeemer
    const redeemer = Data.to(new Constr(0, [newOwnerPkh])); // ChangeOwner

    const tx = await this.lucid
      .newTx()
      .collectFrom([utxo], redeemer)
      .attach.SpendingValidator(this.identityValidator)
      .pay.ToContract(
        this.identityValidatorAddress,
        { kind: "inline", value: newDatum },
        { [toUnit(this.identityNftPolicyId, tokenName)]: 1n }
      )
      .addSigner(address)
      .complete();

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    console.log(`Ownership changed successfully!`);
    console.log(`Transaction hash: ${txHash}`);
    console.log(`New owner: ${newOwnerPkh}`);

    return txHash;
  }

  /**
   * Adds a delegate to the identity
   *
   * @param delegateType - Type of delegate (e.g., "veriKey", "sigAuth")
   * @param delegatePkh - Public key hash of the delegate
   * @param validityMs - Validity period in milliseconds (0 for permanent)
   * @returns Transaction hash
   */
  async addDelegate(
    delegateType: string,
    delegatePkh: string,
    validityMs: bigint
  ): Promise<string> {
    const address = await this.lucid.wallet().address();
    const utxo = await this.findIdentityUtxo();
    if (!utxo || !utxo.datum) {
      throw new Error("Identity UTXO not found");
    }

    const currentDatum = parseIdentityDatum(utxo.datum);
    const tokenName = Object.keys(utxo.assets)
      .find((unit) => unit.startsWith(this.identityNftPolicyId))
      ?.slice(56);
    if (!tokenName) {
      throw new Error("Identity NFT not found in UTXO");
    }

    // Calculate validity timestamp
    const currentTime = BigInt(Date.now());
    const validUntil = validityMs === 0n ? 0n : currentTime + validityMs;

    // Add new delegate, replacing any existing with same address and type
    const existingDelegates = currentDatum.delegates.filter(
      (d) => !(d.delegateAddress === delegatePkh && d.delegateType === delegateType)
    );
    const newDelegates = [
      ...existingDelegates,
      {
        delegateAddress: delegatePkh,
        delegateType,
        validUntil,
      },
    ];

    // Create the new datum
    const newDatum = Data.to(
      {
        identity: currentDatum.identity,
        owner: currentDatum.owner,
        delegates: newDelegates.map((d) => ({
          delegate_address: d.delegateAddress,
          delegate_type: fromText(d.delegateType),
          valid_until: d.validUntil,
        })),
        attributes: currentDatum.attributes.map((a) => ({
          name: fromText(a.name),
          value: fromText(a.value),
          valid_until: a.validUntil,
        })),
        nonce: currentDatum.nonce + 1n,
      },
      IdentityDatumType
    );

    // Create the redeemer
    const redeemer = Data.to(
      new Constr(1, [fromText(delegateType), delegatePkh, validityMs])
    ); // AddDelegate

    const tx = await this.lucid
      .newTx()
      .collectFrom([utxo], redeemer)
      .attach.SpendingValidator(this.identityValidator)
      .pay.ToContract(
        this.identityValidatorAddress,
        { kind: "inline", value: newDatum },
        { [toUnit(this.identityNftPolicyId, tokenName)]: 1n }
      )
      .addSigner(address)
      .validFrom(Date.now() - 60_000)
      .validTo(Date.now() + 600_000)
      .complete();

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    console.log(`Delegate added successfully!`);
    console.log(`Transaction hash: ${txHash}`);
    console.log(`Delegate: ${delegatePkh}`);
    console.log(`Type: ${delegateType}`);
    console.log(`Valid until: ${validUntil === 0n ? "permanent" : new Date(Number(validUntil)).toISOString()}`);

    return txHash;
  }

  /**
   * Revokes a delegate from the identity
   *
   * @param delegateType - Type of delegate
   * @param delegatePkh - Public key hash of the delegate
   * @returns Transaction hash
   */
  async revokeDelegate(
    delegateType: string,
    delegatePkh: string
  ): Promise<string> {
    const address = await this.lucid.wallet().address();
    const utxo = await this.findIdentityUtxo();
    if (!utxo || !utxo.datum) {
      throw new Error("Identity UTXO not found");
    }

    const currentDatum = parseIdentityDatum(utxo.datum);
    const tokenName = Object.keys(utxo.assets)
      .find((unit) => unit.startsWith(this.identityNftPolicyId))
      ?.slice(56);
    if (!tokenName) {
      throw new Error("Identity NFT not found in UTXO");
    }

    // Remove the delegate
    const newDelegates = currentDatum.delegates.filter(
      (d) => !(d.delegateAddress === delegatePkh && d.delegateType === delegateType)
    );

    // Create the new datum
    const newDatum = Data.to(
      {
        identity: currentDatum.identity,
        owner: currentDatum.owner,
        delegates: newDelegates.map((d) => ({
          delegate_address: d.delegateAddress,
          delegate_type: fromText(d.delegateType),
          valid_until: d.validUntil,
        })),
        attributes: currentDatum.attributes.map((a) => ({
          name: fromText(a.name),
          value: fromText(a.value),
          valid_until: a.validUntil,
        })),
        nonce: currentDatum.nonce + 1n,
      },
      IdentityDatumType
    );

    // Create the redeemer
    const redeemer = Data.to(
      new Constr(2, [fromText(delegateType), delegatePkh])
    ); // RevokeDelegate

    const tx = await this.lucid
      .newTx()
      .collectFrom([utxo], redeemer)
      .attach.SpendingValidator(this.identityValidator)
      .pay.ToContract(
        this.identityValidatorAddress,
        { kind: "inline", value: newDatum },
        { [toUnit(this.identityNftPolicyId, tokenName)]: 1n }
      )
      .addSigner(address)
      .complete();

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    console.log(`Delegate revoked successfully!`);
    console.log(`Transaction hash: ${txHash}`);

    return txHash;
  }

  /**
   * Sets an attribute on the identity
   *
   * @param name - Attribute name
   * @param value - Attribute value
   * @param validityMs - Validity period in milliseconds (0 for permanent)
   * @returns Transaction hash
   */
  async setAttribute(
    name: string,
    value: string,
    validityMs: bigint
  ): Promise<string> {
    const address = await this.lucid.wallet().address();
    const utxo = await this.findIdentityUtxo();
    if (!utxo || !utxo.datum) {
      throw new Error("Identity UTXO not found");
    }

    const currentDatum = parseIdentityDatum(utxo.datum);
    const tokenName = Object.keys(utxo.assets)
      .find((unit) => unit.startsWith(this.identityNftPolicyId))
      ?.slice(56);
    if (!tokenName) {
      throw new Error("Identity NFT not found in UTXO");
    }

    // Calculate validity timestamp
    const currentTime = BigInt(Date.now());
    const validUntil = validityMs === 0n ? 0n : currentTime + validityMs;

    // Add/update attribute
    const existingAttributes = currentDatum.attributes.filter(
      (a) => a.name !== name
    );
    const newAttributes = [
      ...existingAttributes,
      { name, value, validUntil },
    ];

    // Create the new datum
    const newDatum = Data.to(
      {
        identity: currentDatum.identity,
        owner: currentDatum.owner,
        delegates: currentDatum.delegates.map((d) => ({
          delegate_address: d.delegateAddress,
          delegate_type: fromText(d.delegateType),
          valid_until: d.validUntil,
        })),
        attributes: newAttributes.map((a) => ({
          name: fromText(a.name),
          value: fromText(a.value),
          valid_until: a.validUntil,
        })),
        nonce: currentDatum.nonce + 1n,
      },
      IdentityDatumType
    );

    // Create the redeemer
    const redeemer = Data.to(
      new Constr(3, [fromText(name), fromText(value), validityMs])
    ); // SetAttribute

    const tx = await this.lucid
      .newTx()
      .collectFrom([utxo], redeemer)
      .attach.SpendingValidator(this.identityValidator)
      .pay.ToContract(
        this.identityValidatorAddress,
        { kind: "inline", value: newDatum },
        { [toUnit(this.identityNftPolicyId, tokenName)]: 1n }
      )
      .addSigner(address)
      .validFrom(Date.now() - 60_000)
      .validTo(Date.now() + 600_000)
      .complete();

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    console.log(`Attribute set successfully!`);
    console.log(`Transaction hash: ${txHash}`);
    console.log(`Attribute: ${name} = ${value}`);

    return txHash;
  }

  /**
   * Revokes an attribute from the identity
   *
   * @param name - Attribute name
   * @param value - Attribute value
   * @returns Transaction hash
   */
  async revokeAttribute(name: string, value: string): Promise<string> {
    const address = await this.lucid.wallet().address();
    const utxo = await this.findIdentityUtxo();
    if (!utxo || !utxo.datum) {
      throw new Error("Identity UTXO not found");
    }

    const currentDatum = parseIdentityDatum(utxo.datum);
    const tokenName = Object.keys(utxo.assets)
      .find((unit) => unit.startsWith(this.identityNftPolicyId))
      ?.slice(56);
    if (!tokenName) {
      throw new Error("Identity NFT not found in UTXO");
    }

    // Remove the attribute
    const newAttributes = currentDatum.attributes.filter(
      (a) => !(a.name === name && a.value === value)
    );

    // Create the new datum
    const newDatum = Data.to(
      {
        identity: currentDatum.identity,
        owner: currentDatum.owner,
        delegates: currentDatum.delegates.map((d) => ({
          delegate_address: d.delegateAddress,
          delegate_type: fromText(d.delegateType),
          valid_until: d.validUntil,
        })),
        attributes: newAttributes.map((a) => ({
          name: fromText(a.name),
          value: fromText(a.value),
          valid_until: a.validUntil,
        })),
        nonce: currentDatum.nonce + 1n,
      },
      IdentityDatumType
    );

    // Create the redeemer
    const redeemer = Data.to(
      new Constr(4, [fromText(name), fromText(value)])
    ); // RevokeAttribute

    const tx = await this.lucid
      .newTx()
      .collectFrom([utxo], redeemer)
      .attach.SpendingValidator(this.identityValidator)
      .pay.ToContract(
        this.identityValidatorAddress,
        { kind: "inline", value: newDatum },
        { [toUnit(this.identityNftPolicyId, tokenName)]: 1n }
      )
      .addSigner(address)
      .complete();

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    console.log(`Attribute revoked successfully!`);
    console.log(`Transaction hash: ${txHash}`);

    return txHash;
  }

  /**
   * Checks if a specific delegate is currently valid for the identity
   *
   * @param delegateType - Type of delegate
   * @param delegatePkh - Public key hash of the delegate
   * @returns True if delegate is valid
   */
  async isValidDelegate(
    delegateType: string,
    delegatePkh: string
  ): Promise<boolean> {
    const datum = await this.getIdentityDatum();
    if (!datum) {
      return false;
    }

    const currentTime = BigInt(Date.now());
    const delegate = datum.delegates.find(
      (d) => d.delegateType === delegateType && d.delegateAddress === delegatePkh
    );

    if (!delegate) {
      return false;
    }

    return isDelegateValid(delegate, currentTime);
  }

  /**
   * Gets all currently valid delegates
   *
   * @returns List of valid delegates
   */
  async getValidDelegates(): Promise<Delegate[]> {
    const datum = await this.getIdentityDatum();
    if (!datum) {
      return [];
    }

    const currentTime = BigInt(Date.now());
    return datum.delegates.filter((d) => isDelegateValid(d, currentTime));
  }

  /**
   * Gets all currently valid attributes
   *
   * @returns List of valid attributes
   */
  async getValidAttributes(): Promise<Attribute[]> {
    const datum = await this.getIdentityDatum();
    if (!datum) {
      return [];
    }

    const currentTime = BigInt(Date.now());
    return datum.attributes.filter((a) => isAttributeValid(a, currentTime));
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

/**
 * Main CLI entry point
 */
async function main() {
  const args = Deno.args;

  if (args.length === 0) {
    printUsage();
    Deno.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "prepare":
      await prepareWallet();
      break;
    case "create":
      await createIdentityCmd();
      break;
    case "info":
      await getIdentityInfo();
      break;
    case "change-owner":
      if (args.length < 2) {
        console.error("Usage: identity.ts change-owner <new_owner_pkh>");
        Deno.exit(1);
      }
      await changeOwnerCmd(args[1]);
      break;
    case "add-delegate":
      if (args.length < 4) {
        console.error(
          "Usage: identity.ts add-delegate <delegate_pkh> <type> <validity_days>"
        );
        Deno.exit(1);
      }
      await addDelegateCmd(args[1], args[2], parseInt(args[3]));
      break;
    case "revoke-delegate":
      if (args.length < 3) {
        console.error(
          "Usage: identity.ts revoke-delegate <delegate_pkh> <type>"
        );
        Deno.exit(1);
      }
      await revokeDelegateCmd(args[1], args[2]);
      break;
    case "set-attribute":
      if (args.length < 4) {
        console.error(
          "Usage: identity.ts set-attribute <name> <value> <validity_days>"
        );
        Deno.exit(1);
      }
      await setAttributeCmd(args[1], args[2], parseInt(args[3]));
      break;
    case "revoke-attribute":
      if (args.length < 3) {
        console.error("Usage: identity.ts revoke-attribute <name> <value>");
        Deno.exit(1);
      }
      await revokeAttributeCmd(args[1], args[2]);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      Deno.exit(1);
  }
}

function printUsage() {
  console.log(`
Decentralized Identity CLI

Usage: deno run -A identity.ts <command> [options]

Commands:
  prepare                                    Generate a new wallet
  create                                     Create a new identity
  info                                       Get identity information
  change-owner <new_owner_pkh>               Transfer identity ownership
  add-delegate <delegate_pkh> <type> <days>  Add a delegate (0 days = permanent)
  revoke-delegate <delegate_pkh> <type>      Revoke a delegate
  set-attribute <name> <value> <days>        Set an attribute (0 days = permanent)
  revoke-attribute <name> <value>            Revoke an attribute

Examples:
  deno run -A identity.ts prepare
  deno run -A identity.ts create
  deno run -A identity.ts add-delegate abc123... veriKey 30
  deno run -A identity.ts set-attribute "name" "Alice" 0
  `);
}

async function prepareWallet() {
  const identity = new DecentralizedIdentity({
    network: "Preprod",
    provider: "koios",
  });
  await identity.initialize();

  const seedPhrase = identity.generateWallet();
  const address = await identity.getWalletAddress();

  Deno.writeTextFileSync("wallet.txt", seedPhrase);

  console.log("Wallet generated successfully!");
  console.log(`Address: ${address}`);
  console.log("Seed phrase saved to wallet.txt");
  console.log(
    "\nPlease send some tADA to this address to use it for transactions."
  );
}

async function createIdentityCmd() {
  console.log(
    "Note: This command requires a compiled plutus.json from 'aiken build'"
  );
  console.log(
    "Import the blueprint and call identity.createIdentity(blueprint)"
  );
}

async function getIdentityInfo() {
  console.log(
    "Note: Load validators first with identity.loadValidators(blueprint, utxoRef)"
  );
  console.log("Then call identity.getIdentityDatum() to get current state");
}

async function changeOwnerCmd(newOwnerPkh: string) {
  console.log(
    "Note: Load validators first with identity.loadValidators(blueprint, utxoRef)"
  );
  console.log(`Then call identity.changeOwner("${newOwnerPkh}")`);
}

async function addDelegateCmd(
  delegatePkh: string,
  delegateType: string,
  validityDays: number
) {
  const validityMs =
    validityDays === 0 ? 0n : BigInt(validityDays * 24 * 60 * 60 * 1000);
  console.log(
    "Note: Load validators first with identity.loadValidators(blueprint, utxoRef)"
  );
  console.log(
    `Then call identity.addDelegate("${delegateType}", "${delegatePkh}", ${validityMs}n)`
  );
}

async function revokeDelegateCmd(delegatePkh: string, delegateType: string) {
  console.log(
    "Note: Load validators first with identity.loadValidators(blueprint, utxoRef)"
  );
  console.log(
    `Then call identity.revokeDelegate("${delegateType}", "${delegatePkh}")`
  );
}

async function setAttributeCmd(
  name: string,
  value: string,
  validityDays: number
) {
  const validityMs =
    validityDays === 0 ? 0n : BigInt(validityDays * 24 * 60 * 60 * 1000);
  console.log(
    "Note: Load validators first with identity.loadValidators(blueprint, utxoRef)"
  );
  console.log(
    `Then call identity.setAttribute("${name}", "${value}", ${validityMs}n)`
  );
}

async function revokeAttributeCmd(name: string, value: string) {
  console.log(
    "Note: Load validators first with identity.loadValidators(blueprint, utxoRef)"
  );
  console.log(`Then call identity.revokeAttribute("${name}", "${value}")`);
}

// Run the CLI if this is the main module
if (import.meta.main) {
  main();
}
