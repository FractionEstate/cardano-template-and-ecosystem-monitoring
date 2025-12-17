/**
 * Decentralized Identity - MeshJS Off-chain Implementation
 *
 * This module provides functions to interact with the decentralized identity
 * smart contracts on Cardano using MeshJS. It implements EIP-1056 style identity
 * management including identity creation, ownership transfer, delegate management,
 * and attribute storage.
 *
 * @module identity
 */

import {
  ConStr0,
  ConStr1,
  ConStr2,
  ConStr3,
  ConStr4,
  conStr0,
  conStr1,
  conStr2,
  conStr3,
  conStr4,
  DEFAULT_REDEEMER_BUDGET,
  mConStr0,
  mConStr1,
  mConStr2,
  mConStr3,
  mConStr4,
  byteString,
  integer,
  list,
} from "@meshsdk/common";
import {
  Asset,
  deserializeAddress,
  deserializeDatum,
  serializeAddressObj,
  UTxO,
  MeshTxBuilder,
  AppWallet,
  BlockfrostProvider,
  KoiosProvider,
  IFetcher,
  ISubmitter,
  PlutusScript,
  resolveScriptHash,
  stringToHex,
  hexToString,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-cst";
import { sha256 } from "@noble/hashes/sha2";
import { encodeHex, decodeHex } from "@std/encoding/hex";

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
  validUntil: number;
}

/**
 * Represents an identity attribute
 */
export interface Attribute {
  name: string;
  value: string;
  validUntil: number;
}

/**
 * Identity datum structure stored on-chain
 */
export interface IdentityDatum {
  identity: string;
  owner: string;
  delegates: Delegate[];
  attributes: Attribute[];
  nonce: number;
}

/**
 * Network configuration
 */
export type NetworkId = 0 | 1;

/**
 * Provider configuration
 */
export interface ProviderConfig {
  type: "blockfrost" | "koios";
  apiKey?: string;
  network: "mainnet" | "preprod" | "preview";
}

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
 * Creates a delegate datum structure
 */
function createDelegateDatum(delegate: Delegate) {
  return conStr0([
    byteString(delegate.delegateAddress),
    byteString(stringToHex(delegate.delegateType)),
    integer(delegate.validUntil),
  ]);
}

/**
 * Creates an attribute datum structure
 */
function createAttributeDatum(attribute: Attribute) {
  return conStr0([
    byteString(stringToHex(attribute.name)),
    byteString(stringToHex(attribute.value)),
    integer(attribute.validUntil),
  ]);
}

/**
 * Creates the identity datum structure
 */
function createIdentityDatum(datum: IdentityDatum) {
  return conStr0([
    byteString(datum.identity),
    byteString(datum.owner),
    list(datum.delegates.map(createDelegateDatum)),
    list(datum.attributes.map(createAttributeDatum)),
    integer(datum.nonce),
  ]);
}

/**
 * Parses an on-chain datum into an IdentityDatum object
 */
export function parseIdentityDatum(plutusData: any): IdentityDatum {
  const fields = plutusData.fields;
  return {
    identity: fields[0].bytes,
    owner: fields[1].bytes,
    delegates: (fields[2].list || []).map((d: any) => ({
      delegateAddress: d.fields[0].bytes,
      delegateType: hexToString(d.fields[1].bytes),
      validUntil: Number(d.fields[2].int),
    })),
    attributes: (fields[3].list || []).map((a: any) => ({
      name: hexToString(a.fields[0].bytes),
      value: hexToString(a.fields[1].bytes),
      validUntil: Number(a.fields[2].int),
    })),
    nonce: Number(fields[4].int),
  };
}

/**
 * Checks if a delegate is currently valid
 */
export function isDelegateValid(delegate: Delegate, currentTime: number): boolean {
  return delegate.validUntil === 0 || delegate.validUntil > currentTime;
}

/**
 * Checks if an attribute is currently valid
 */
export function isAttributeValid(attribute: Attribute, currentTime: number): boolean {
  return attribute.validUntil === 0 || attribute.validUntil > currentTime;
}

// ============================================================================
// IDENTITY CONTRACT CLASS
// ============================================================================

/**
 * Main class for interacting with the Decentralized Identity smart contracts.
 *
 * @example
 * ```typescript
 * const identity = new MeshIdentityContract({
 *   type: "koios",
 *   network: "preprod",
 * });
 * await identity.initialize(wallet);
 * const txHex = await identity.createIdentity();
 * ```
 */
export class MeshIdentityContract {
  private fetcher!: IFetcher;
  private submitter!: ISubmitter;
  private mesh!: MeshTxBuilder;
  private wallet!: AppWallet;
  private networkId: NetworkId;
  private providerConfig: ProviderConfig;

  private identityNftScript!: PlutusScript;
  private identityScript!: PlutusScript;
  private identityNftPolicyId!: string;
  private identityScriptAddress!: string;

  /**
   * Creates a new MeshIdentityContract instance
   *
   * @param config - Provider configuration
   */
  constructor(config: ProviderConfig) {
    this.providerConfig = config;
    this.networkId = config.network === "mainnet" ? 1 : 0;
  }

  /**
   * Initializes the contract with a wallet
   *
   * @param wallet - MeshJS wallet instance
   */
  async initialize(wallet: AppWallet): Promise<void> {
    this.wallet = wallet;

    // Initialize provider
    if (this.providerConfig.type === "blockfrost") {
      if (!this.providerConfig.apiKey) {
        throw new Error("Blockfrost API key is required");
      }
      const provider = new BlockfrostProvider(this.providerConfig.apiKey);
      this.fetcher = provider;
      this.submitter = provider;
    } else {
      const baseUrl =
        this.providerConfig.network === "mainnet"
          ? "https://api.koios.rest/api/v1"
          : `https://${this.providerConfig.network}.koios.rest/api/v1`;
      const provider = new KoiosProvider(baseUrl);
      this.fetcher = provider;
      this.submitter = provider;
    }

    this.mesh = new MeshTxBuilder({
      fetcher: this.fetcher,
      submitter: this.submitter,
    });

    console.log("Identity contract initialized successfully");
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
    // Find validators in blueprint
    const nftValidator = blueprint.validators.find(
      (v: any) => v.title === "identity_nft.identity_nft"
    );
    const spendValidator = blueprint.validators.find(
      (v: any) => v.title === "identity.identity"
    );

    if (!nftValidator || !spendValidator) {
      throw new Error("Required validators not found in blueprint");
    }

    // Get identity validator hash first
    const tempIdentityScript: PlutusScript = {
      version: "V3",
      code: spendValidator.compiledCode,
    };
    const identityValidatorHash = resolveScriptHash(
      tempIdentityScript.code,
      "V3"
    );

    // Create output reference for NFT policy parameterization
    const outputRefParam = conStr0([
      byteString(utxoRef.txHash),
      integer(utxoRef.outputIndex),
    ]);

    // Apply parameters to NFT policy
    const nftPolicyCode = applyParamsToScript(nftValidator.compiledCode, [
      outputRefParam,
      byteString(identityValidatorHash),
    ]);

    this.identityNftScript = {
      version: "V3",
      code: nftPolicyCode,
    };
    this.identityNftPolicyId = resolveScriptHash(nftPolicyCode, "V3");

    // Compute identity token name
    const tokenName = computeIdentityTokenName(
      utxoRef.txHash,
      utxoRef.outputIndex
    );

    // Apply parameters to identity validator
    const identityCode = applyParamsToScript(spendValidator.compiledCode, [
      byteString(this.identityNftPolicyId),
      byteString(tokenName),
    ]);

    this.identityScript = {
      version: "V3",
      code: identityCode,
    };

    // Calculate script address
    const scriptHash = resolveScriptHash(identityCode, "V3");
    // Note: Address calculation would need proper implementation
    this.identityScriptAddress = scriptHash; // Placeholder
  }

  /**
   * Gets the current wallet address
   */
  async getWalletAddress(): Promise<string> {
    const addresses = await this.wallet.getUsedAddresses();
    return addresses[0];
  }

  /**
   * Gets the wallet's public key hash
   */
  async getWalletPkh(): Promise<string> {
    const address = await this.getWalletAddress();
    const { pubKeyHash } = deserializeAddress(address);
    return pubKeyHash;
  }

  /**
   * Gets UTXOs from the wallet
   */
  async getWalletUtxos(): Promise<UTxO[]> {
    return await this.wallet.getUtxos();
  }

  /**
   * Gets collateral UTxO from the wallet
   */
  async getCollateral(): Promise<UTxO> {
    const collaterals = await this.wallet.getCollateral();
    if (!collaterals || collaterals.length === 0) {
      throw new Error("No collateral found in wallet");
    }
    return collaterals[0];
  }

  /**
   * Creates a new decentralized identity.
   * This mints a unique identity NFT and creates the identity UTXO.
   *
   * @param blueprint - Compiled plutus.json
   * @returns Transaction hex for signing
   */
  async createIdentity(blueprint: any): Promise<string> {
    const address = await this.getWalletAddress();
    const pkh = await this.getWalletPkh();
    const utxos = await this.getWalletUtxos();
    const collateral = await this.getCollateral();

    // Find suitable UTXO for one-shot minting
    const selectedUtxo = utxos.find(
      (utxo) =>
        utxo.output.amount.find(
          (a) => a.unit === "lovelace" && parseInt(a.quantity) > 5_000_000
        )
    );
    if (!selectedUtxo) {
      throw new Error("No suitable UTXO found for identity creation");
    }

    // Load validators with the selected UTXO
    this.loadValidators(blueprint, {
      txHash: selectedUtxo.input.txHash,
      outputIndex: selectedUtxo.input.outputIndex,
    });

    // Compute token name
    const tokenName = computeIdentityTokenName(
      selectedUtxo.input.txHash,
      selectedUtxo.input.outputIndex
    );

    // Create initial datum
    const initialDatum: IdentityDatum = {
      identity: pkh,
      owner: pkh,
      delegates: [],
      attributes: [],
      nonce: 0,
    };

    // Build transaction
    await this.mesh
      .txIn(
        selectedUtxo.input.txHash,
        selectedUtxo.input.outputIndex
      )
      .mintPlutusScript("V3")
      .mint("1", this.identityNftPolicyId, tokenName)
      .mintingScript(this.identityNftScript.code)
      .mintRedeemerValue(mConStr0([]), "Mesh", DEFAULT_REDEEMER_BUDGET)
      .txOut(this.identityScriptAddress, [
        { unit: "lovelace", quantity: "2000000" },
        { unit: this.identityNftPolicyId + tokenName, quantity: "1" },
      ])
      .txOutInlineDatumValue(createIdentityDatum(initialDatum), "Mesh")
      .changeAddress(address)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .requiredSignerHash(pkh)
      .selectUtxosFrom(utxos)
      .complete();

    return this.mesh.txHex;
  }

  /**
   * Finds the identity UTXO at the script address
   *
   * @returns The identity UTXO or null
   */
  async findIdentityUtxo(): Promise<UTxO | null> {
    const utxos = await this.fetcher.fetchAddressUTxOs(this.identityScriptAddress);

    for (const utxo of utxos) {
      const hasNft = utxo.output.amount.some((asset: Asset) =>
        asset.unit.startsWith(this.identityNftPolicyId)
      );
      if (hasNft && utxo.output.plutusData) {
        return utxo;
      }
    }

    return null;
  }

  /**
   * Gets the current identity datum
   */
  async getIdentityDatum(): Promise<IdentityDatum | null> {
    const utxo = await this.findIdentityUtxo();
    if (!utxo || !utxo.output.plutusData) {
      return null;
    }
    return parseIdentityDatum(deserializeDatum(utxo.output.plutusData));
  }

  /**
   * Changes the owner of the identity
   *
   * @param newOwnerPkh - Public key hash of the new owner
   * @returns Transaction hex
   */
  async changeOwner(newOwnerPkh: string): Promise<string> {
    const address = await this.getWalletAddress();
    const pkh = await this.getWalletPkh();
    const utxos = await this.getWalletUtxos();
    const collateral = await this.getCollateral();

    const identityUtxo = await this.findIdentityUtxo();
    if (!identityUtxo || !identityUtxo.output.plutusData) {
      throw new Error("Identity UTXO not found");
    }

    const currentDatum = parseIdentityDatum(
      deserializeDatum(identityUtxo.output.plutusData)
    );

    // Find token name
    const nftAsset = identityUtxo.output.amount.find((a: Asset) =>
      a.unit.startsWith(this.identityNftPolicyId)
    );
    if (!nftAsset) {
      throw new Error("Identity NFT not found");
    }
    const tokenName = nftAsset.unit.slice(56);

    // Create new datum
    const newDatum: IdentityDatum = {
      ...currentDatum,
      owner: newOwnerPkh,
      nonce: currentDatum.nonce + 1,
    };

    // Build transaction
    await this.mesh
      .spendingPlutusScript("V3")
      .txIn(
        identityUtxo.input.txHash,
        identityUtxo.input.outputIndex,
        identityUtxo.output.amount,
        this.identityScriptAddress
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(
        mConStr0([byteString(newOwnerPkh)]),
        "Mesh",
        DEFAULT_REDEEMER_BUDGET
      )
      .txInScript(this.identityScript.code)
      .txOut(this.identityScriptAddress, [
        { unit: "lovelace", quantity: "2000000" },
        { unit: this.identityNftPolicyId + tokenName, quantity: "1" },
      ])
      .txOutInlineDatumValue(createIdentityDatum(newDatum), "Mesh")
      .changeAddress(address)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .requiredSignerHash(pkh)
      .selectUtxosFrom(utxos)
      .complete();

    return this.mesh.txHex;
  }

  /**
   * Adds a delegate to the identity
   *
   * @param delegateType - Type of delegate
   * @param delegatePkh - Public key hash of the delegate
   * @param validityMs - Validity in milliseconds (0 for permanent)
   * @returns Transaction hex
   */
  async addDelegate(
    delegateType: string,
    delegatePkh: string,
    validityMs: number
  ): Promise<string> {
    const address = await this.getWalletAddress();
    const pkh = await this.getWalletPkh();
    const utxos = await this.getWalletUtxos();
    const collateral = await this.getCollateral();

    const identityUtxo = await this.findIdentityUtxo();
    if (!identityUtxo || !identityUtxo.output.plutusData) {
      throw new Error("Identity UTXO not found");
    }

    const currentDatum = parseIdentityDatum(
      deserializeDatum(identityUtxo.output.plutusData)
    );

    const nftAsset = identityUtxo.output.amount.find((a: Asset) =>
      a.unit.startsWith(this.identityNftPolicyId)
    );
    if (!nftAsset) {
      throw new Error("Identity NFT not found");
    }
    const tokenName = nftAsset.unit.slice(56);

    // Calculate validity
    const currentTime = Date.now();
    const validUntil = validityMs === 0 ? 0 : currentTime + validityMs;

    // Update delegates
    const existingDelegates = currentDatum.delegates.filter(
      (d) => !(d.delegateAddress === delegatePkh && d.delegateType === delegateType)
    );
    const newDelegates = [
      ...existingDelegates,
      { delegateAddress: delegatePkh, delegateType, validUntil },
    ];

    // Create new datum
    const newDatum: IdentityDatum = {
      ...currentDatum,
      delegates: newDelegates,
      nonce: currentDatum.nonce + 1,
    };

    // Build transaction
    await this.mesh
      .spendingPlutusScript("V3")
      .txIn(
        identityUtxo.input.txHash,
        identityUtxo.input.outputIndex,
        identityUtxo.output.amount,
        this.identityScriptAddress
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(
        mConStr1([
          byteString(stringToHex(delegateType)),
          byteString(delegatePkh),
          integer(validityMs),
        ]),
        "Mesh",
        DEFAULT_REDEEMER_BUDGET
      )
      .txInScript(this.identityScript.code)
      .txOut(this.identityScriptAddress, [
        { unit: "lovelace", quantity: "2000000" },
        { unit: this.identityNftPolicyId + tokenName, quantity: "1" },
      ])
      .txOutInlineDatumValue(createIdentityDatum(newDatum), "Mesh")
      .changeAddress(address)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .requiredSignerHash(pkh)
      .validFrom(currentTime - 60_000)
      .validTo(currentTime + 600_000)
      .selectUtxosFrom(utxos)
      .complete();

    return this.mesh.txHex;
  }

  /**
   * Revokes a delegate from the identity
   *
   * @param delegateType - Type of delegate
   * @param delegatePkh - Public key hash of the delegate
   * @returns Transaction hex
   */
  async revokeDelegate(delegateType: string, delegatePkh: string): Promise<string> {
    const address = await this.getWalletAddress();
    const pkh = await this.getWalletPkh();
    const utxos = await this.getWalletUtxos();
    const collateral = await this.getCollateral();

    const identityUtxo = await this.findIdentityUtxo();
    if (!identityUtxo || !identityUtxo.output.plutusData) {
      throw new Error("Identity UTXO not found");
    }

    const currentDatum = parseIdentityDatum(
      deserializeDatum(identityUtxo.output.plutusData)
    );

    const nftAsset = identityUtxo.output.amount.find((a: Asset) =>
      a.unit.startsWith(this.identityNftPolicyId)
    );
    if (!nftAsset) {
      throw new Error("Identity NFT not found");
    }
    const tokenName = nftAsset.unit.slice(56);

    // Remove delegate
    const newDelegates = currentDatum.delegates.filter(
      (d) => !(d.delegateAddress === delegatePkh && d.delegateType === delegateType)
    );

    // Create new datum
    const newDatum: IdentityDatum = {
      ...currentDatum,
      delegates: newDelegates,
      nonce: currentDatum.nonce + 1,
    };

    // Build transaction
    await this.mesh
      .spendingPlutusScript("V3")
      .txIn(
        identityUtxo.input.txHash,
        identityUtxo.input.outputIndex,
        identityUtxo.output.amount,
        this.identityScriptAddress
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(
        mConStr2([byteString(stringToHex(delegateType)), byteString(delegatePkh)]),
        "Mesh",
        DEFAULT_REDEEMER_BUDGET
      )
      .txInScript(this.identityScript.code)
      .txOut(this.identityScriptAddress, [
        { unit: "lovelace", quantity: "2000000" },
        { unit: this.identityNftPolicyId + tokenName, quantity: "1" },
      ])
      .txOutInlineDatumValue(createIdentityDatum(newDatum), "Mesh")
      .changeAddress(address)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .requiredSignerHash(pkh)
      .selectUtxosFrom(utxos)
      .complete();

    return this.mesh.txHex;
  }

  /**
   * Sets an attribute on the identity
   *
   * @param name - Attribute name
   * @param value - Attribute value
   * @param validityMs - Validity in milliseconds (0 for permanent)
   * @returns Transaction hex
   */
  async setAttribute(name: string, value: string, validityMs: number): Promise<string> {
    const address = await this.getWalletAddress();
    const pkh = await this.getWalletPkh();
    const utxos = await this.getWalletUtxos();
    const collateral = await this.getCollateral();

    const identityUtxo = await this.findIdentityUtxo();
    if (!identityUtxo || !identityUtxo.output.plutusData) {
      throw new Error("Identity UTXO not found");
    }

    const currentDatum = parseIdentityDatum(
      deserializeDatum(identityUtxo.output.plutusData)
    );

    const nftAsset = identityUtxo.output.amount.find((a: Asset) =>
      a.unit.startsWith(this.identityNftPolicyId)
    );
    if (!nftAsset) {
      throw new Error("Identity NFT not found");
    }
    const tokenName = nftAsset.unit.slice(56);

    // Calculate validity
    const currentTime = Date.now();
    const validUntil = validityMs === 0 ? 0 : currentTime + validityMs;

    // Update attributes
    const existingAttributes = currentDatum.attributes.filter((a) => a.name !== name);
    const newAttributes = [...existingAttributes, { name, value, validUntil }];

    // Create new datum
    const newDatum: IdentityDatum = {
      ...currentDatum,
      attributes: newAttributes,
      nonce: currentDatum.nonce + 1,
    };

    // Build transaction
    await this.mesh
      .spendingPlutusScript("V3")
      .txIn(
        identityUtxo.input.txHash,
        identityUtxo.input.outputIndex,
        identityUtxo.output.amount,
        this.identityScriptAddress
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(
        mConStr3([
          byteString(stringToHex(name)),
          byteString(stringToHex(value)),
          integer(validityMs),
        ]),
        "Mesh",
        DEFAULT_REDEEMER_BUDGET
      )
      .txInScript(this.identityScript.code)
      .txOut(this.identityScriptAddress, [
        { unit: "lovelace", quantity: "2000000" },
        { unit: this.identityNftPolicyId + tokenName, quantity: "1" },
      ])
      .txOutInlineDatumValue(createIdentityDatum(newDatum), "Mesh")
      .changeAddress(address)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .requiredSignerHash(pkh)
      .validFrom(currentTime - 60_000)
      .validTo(currentTime + 600_000)
      .selectUtxosFrom(utxos)
      .complete();

    return this.mesh.txHex;
  }

  /**
   * Revokes an attribute from the identity
   *
   * @param name - Attribute name
   * @param value - Attribute value
   * @returns Transaction hex
   */
  async revokeAttribute(name: string, value: string): Promise<string> {
    const address = await this.getWalletAddress();
    const pkh = await this.getWalletPkh();
    const utxos = await this.getWalletUtxos();
    const collateral = await this.getCollateral();

    const identityUtxo = await this.findIdentityUtxo();
    if (!identityUtxo || !identityUtxo.output.plutusData) {
      throw new Error("Identity UTXO not found");
    }

    const currentDatum = parseIdentityDatum(
      deserializeDatum(identityUtxo.output.plutusData)
    );

    const nftAsset = identityUtxo.output.amount.find((a: Asset) =>
      a.unit.startsWith(this.identityNftPolicyId)
    );
    if (!nftAsset) {
      throw new Error("Identity NFT not found");
    }
    const tokenName = nftAsset.unit.slice(56);

    // Remove attribute
    const newAttributes = currentDatum.attributes.filter(
      (a) => !(a.name === name && a.value === value)
    );

    // Create new datum
    const newDatum: IdentityDatum = {
      ...currentDatum,
      attributes: newAttributes,
      nonce: currentDatum.nonce + 1,
    };

    // Build transaction
    await this.mesh
      .spendingPlutusScript("V3")
      .txIn(
        identityUtxo.input.txHash,
        identityUtxo.input.outputIndex,
        identityUtxo.output.amount,
        this.identityScriptAddress
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(
        mConStr4([byteString(stringToHex(name)), byteString(stringToHex(value))]),
        "Mesh",
        DEFAULT_REDEEMER_BUDGET
      )
      .txInScript(this.identityScript.code)
      .txOut(this.identityScriptAddress, [
        { unit: "lovelace", quantity: "2000000" },
        { unit: this.identityNftPolicyId + tokenName, quantity: "1" },
      ])
      .txOutInlineDatumValue(createIdentityDatum(newDatum), "Mesh")
      .changeAddress(address)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .requiredSignerHash(pkh)
      .selectUtxosFrom(utxos)
      .complete();

    return this.mesh.txHex;
  }

  /**
   * Gets all currently valid delegates
   */
  async getValidDelegates(): Promise<Delegate[]> {
    const datum = await this.getIdentityDatum();
    if (!datum) {
      return [];
    }
    const currentTime = Date.now();
    return datum.delegates.filter((d) => isDelegateValid(d, currentTime));
  }

  /**
   * Gets all currently valid attributes
   */
  async getValidAttributes(): Promise<Attribute[]> {
    const datum = await this.getIdentityDatum();
    if (!datum) {
      return [];
    }
    const currentTime = Date.now();
    return datum.attributes.filter((a) => isAttributeValid(a, currentTime));
  }

  /**
   * Checks if a specific delegate is valid
   */
  async isValidDelegate(delegateType: string, delegatePkh: string): Promise<boolean> {
    const datum = await this.getIdentityDatum();
    if (!datum) {
      return false;
    }
    const currentTime = Date.now();
    const delegate = datum.delegates.find(
      (d) => d.delegateType === delegateType && d.delegateAddress === delegatePkh
    );
    return delegate ? isDelegateValid(delegate, currentTime) : false;
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = Deno.args;

  if (args.length === 0) {
    printUsage();
    Deno.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "help":
      printUsage();
      break;
    default:
      console.log(`
MeshJS Decentralized Identity Implementation

This module provides the MeshIdentityContract class for interacting with
the Decentralized Identity smart contracts on Cardano.

Usage example:
  import { MeshIdentityContract } from "./identity.ts";

  const contract = new MeshIdentityContract({
    type: "koios",
    network: "preprod",
  });

  await contract.initialize(wallet);
  const txHex = await contract.createIdentity(blueprint);
`);
  }
}

function printUsage() {
  console.log(`
MeshJS Decentralized Identity CLI

Usage: deno run -A identity.ts <command>

Commands:
  help    Show this help message

This module is primarily designed for programmatic use.
Import MeshIdentityContract in your application to use.

API Methods:
  - createIdentity(blueprint)           Create a new identity
  - changeOwner(newOwnerPkh)            Transfer ownership
  - addDelegate(type, pkh, validity)    Add a delegate
  - revokeDelegate(type, pkh)           Revoke a delegate
  - setAttribute(name, value, validity) Set an attribute
  - revokeAttribute(name, value)        Revoke an attribute
  - getIdentityDatum()                  Get current identity state
  - getValidDelegates()                 Get valid delegates
  - getValidAttributes()                Get valid attributes
`);
}

if (import.meta.main) {
  main();
}

export default MeshIdentityContract;
