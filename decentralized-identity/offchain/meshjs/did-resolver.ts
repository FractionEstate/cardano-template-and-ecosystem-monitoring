/**
 * DID Resolver for Cardano Decentralized Identity - MeshJS Implementation
 *
 * This module resolves Cardano-based DIDs (Decentralized Identifiers) following
 * the W3C DID Core specification using MeshJS.
 *
 * DID Format: did:cardano:preprod:<identity_nft_policy_id>
 *
 * @module did-resolver
 */

import {
  MeshIdentityContract,
  parseIdentityDatum,
  isDelegateValid,
  isAttributeValid,
  type IdentityDatum,
  type Delegate,
  type Attribute,
} from "./identity.ts";

// ============================================================================
// W3C DID DOCUMENT TYPES
// ============================================================================

/**
 * W3C DID Document structure
 * @see https://www.w3.org/TR/did-core/
 */
export interface DIDDocument {
  "@context": string[];
  id: string;
  controller?: string[];
  verificationMethod: VerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  keyAgreement?: string[];
  capabilityInvocation?: string[];
  capabilityDelegation?: string[];
  service?: ServiceEndpoint[];
  [key: string]: unknown;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
  blockchainAccountId?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

// ============================================================================
// DID RESOLVER CLASS
// ============================================================================

/**
 * Resolves Cardano DIDs to W3C DID Documents using MeshJS
 *
 * @example
 * ```typescript
 * const resolver = new MeshDIDResolver(identityContract);
 * const didDoc = await resolver.resolve("did:cardano:preprod:abc123...");
 * console.log(JSON.stringify(didDoc, null, 2));
 * ```
 */
export class MeshDIDResolver {
  private contract: MeshIdentityContract;
  private network: string;

  /**
   * Creates a new DID resolver
   *
   * @param contract - Initialized MeshIdentityContract instance
   * @param network - Network identifier (mainnet, preprod, preview)
   */
  constructor(contract: MeshIdentityContract, network: "mainnet" | "preprod" | "preview" = "preprod") {
    this.contract = contract;
    this.network = network;
  }

  /**
   * Resolves a DID to a DID Document
   *
   * @param did - The DID to resolve (e.g., "did:cardano:preprod:abc123...")
   * @returns The resolved DID Document
   */
  async resolve(did: string): Promise<DIDDocument> {
    // Parse and validate DID format
    const didParts = this.parseDID(did);
    if (!didParts) {
      throw new Error(`Invalid DID format: ${did}`);
    }

    const { method, network, identifier } = didParts;

    if (method !== "cardano") {
      throw new Error(`Unsupported DID method: ${method}`);
    }

    if (network !== this.network) {
      throw new Error(`Network mismatch: expected ${this.network}, got ${network}`);
    }

    // Get identity datum from chain
    const datum = await this.contract.getIdentityDatum();
    if (!datum) {
      throw new Error(`Identity not found for DID: ${did}`);
    }

    // Build DID Document
    return this.buildDIDDocument(did, datum);
  }

  /**
   * Parses a DID string into its components
   *
   * @param did - The DID string
   * @returns Parsed DID components or null if invalid
   */
  private parseDID(did: string): { method: string; network: string; identifier: string } | null {
    // Expected format: did:cardano:<network>:<identifier>
    const match = did.match(/^did:([^:]+):([^:]+):([^:]+)$/);
    if (!match) {
      return null;
    }

    return {
      method: match[1],
      network: match[2],
      identifier: match[3],
    };
  }

  /**
   * Builds a W3C DID Document from identity datum
   *
   * @param did - The DID string
   * @param datum - The identity datum from chain
   * @returns Complete DID Document
   */
  private buildDIDDocument(did: string, datum: IdentityDatum): DIDDocument {
    const currentTime = Date.now();
    const validDelegates = datum.delegates.filter((d) => isDelegateValid(d, currentTime));
    const validAttributes = datum.attributes.filter((a) => isAttributeValid(a, currentTime));

    // Build verification methods from delegates
    const verificationMethods: VerificationMethod[] = [];
    const authentication: string[] = [];
    const assertionMethod: string[] = [];
    const keyAgreement: string[] = [];

    // Add owner as primary verification method
    const ownerVMId = `${did}#owner`;
    verificationMethods.push({
      id: ownerVMId,
      type: "Ed25519VerificationKey2020",
      controller: did,
      blockchainAccountId: `cardano:${this.network}:${datum.owner}`,
    });
    authentication.push(ownerVMId);
    assertionMethod.push(ownerVMId);

    // Add delegates as verification methods
    validDelegates.forEach((delegate, index) => {
      const vmId = `${did}#delegate-${index}`;
      const vm: VerificationMethod = {
        id: vmId,
        type: "Ed25519VerificationKey2020",
        controller: did,
        blockchainAccountId: `cardano:${this.network}:${delegate.delegateAddress}`,
      };

      verificationMethods.push(vm);

      // Map delegate types to verification relationships
      const delegateType = delegate.delegateType;
      if (delegateType === "veriKey") {
        authentication.push(vmId);
      } else if (delegateType === "sigAuth") {
        assertionMethod.push(vmId);
      } else if (delegateType === "enc") {
        keyAgreement.push(vmId);
      }
    });

    // Extract service endpoints from attributes
    const services: ServiceEndpoint[] = [];
    validAttributes.forEach((attr, index) => {
      // Attributes with names starting with "did/svc/" are service endpoints
      if (attr.name.startsWith("did/svc/")) {
        const serviceName = attr.name.substring(8); // Remove "did/svc/"
        services.push({
          id: `${did}#service-${index}`,
          type: serviceName,
          serviceEndpoint: attr.value,
        });
      }
    });

    // Build complete DID Document
    const didDocument: DIDDocument = {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1",
      ],
      id: did,
      controller: [did],
      verificationMethod: verificationMethods,
      authentication,
      assertionMethod,
      keyAgreement: keyAgreement.length > 0 ? keyAgreement : undefined,
      capabilityInvocation: [ownerVMId],
      capabilityDelegation: [ownerVMId],
      service: services.length > 0 ? services : undefined,
    };

    // Add custom attributes to DID Document metadata
    const customAttrs: Record<string, string> = {};
    validAttributes.forEach((attr) => {
      if (!attr.name.startsWith("did/")) {
        customAttrs[attr.name] = attr.value;
      }
    });

    if (Object.keys(customAttrs).length > 0) {
      didDocument["cardanoIdentity"] = {
        network: this.network,
        nonce: datum.nonce,
        attributes: customAttrs,
      };
    }

    return didDocument;
  }

  /**
   * Generates a DID from an identity NFT policy ID
   *
   * @param policyId - The identity NFT policy ID
   * @returns The DID string
   */
  static generateDID(policyId: string, network: "mainnet" | "preprod" | "preview" = "preprod"): string {
    return `did:cardano:${network}:${policyId}`;
  }

  /**
   * Resolves a DID and returns a formatted JSON string
   *
   * @param did - The DID to resolve
   * @returns Pretty-printed JSON DID Document
   */
  async resolveToJSON(did: string): Promise<string> {
    const didDoc = await this.resolve(did);
    return JSON.stringify(didDoc, null, 2);
  }

  /**
   * Gets all valid delegates for an identity
   *
   * @returns List of currently valid delegates
   */
  async getValidDelegates(): Promise<Delegate[]> {
    return await this.contract.getValidDelegates();
  }

  /**
   * Gets all valid attributes for an identity
   *
   * @returns List of currently valid attributes
   */
  async getValidAttributes(): Promise<Attribute[]> {
    return await this.contract.getValidAttributes();
  }

  /**
   * Verifies if a specific delegate is valid
   *
   * @param delegateType - Type of delegate
   * @param delegatePkh - Public key hash of delegate
   * @returns True if delegate is valid
   */
  async isValidDelegate(delegateType: string, delegatePkh: string): Promise<boolean> {
    return await this.contract.isValidDelegate(delegateType, delegatePkh);
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = Deno.args;

  if (args.length === 0) {
    console.log(`
MeshJS DID Resolver CLI

Usage: deno run -A did-resolver.ts <command> [options]

Commands:
  generate <policy_id> [network]    Generate a DID from policy ID
  help                              Show this help message

Examples:
  deno run -A did-resolver.ts generate abc123def456... preprod
  deno run -A did-resolver.ts generate abc123def456... mainnet

Note: To resolve a DID, use the MeshDIDResolver class programmatically
with an initialized MeshIdentityContract instance.
    `);
    Deno.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "generate": {
      if (args.length < 2) {
        console.error("Usage: generate <policy_id> [network]");
        Deno.exit(1);
      }

      const policyId = args[1];
      const network = (args[2] as "mainnet" | "preprod" | "preview") || "preprod";
      const did = MeshDIDResolver.generateDID(policyId, network);
      console.log(`Generated DID: ${did}`);
      break;
    }

    case "help":
      main();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log("Run with no arguments for help.");
      Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}

export default MeshDIDResolver;
