/// usr/bin/env jbang "$0" "$@" ; exit $?
///
// @formatter:off
//JAVA 24+
//COMPILE_OPTIONS --enable-preview -source 24
//RUNTIME_OPTIONS --enable-preview

//DEPS com.google.code.gson:gson:2.10.1
// @formatter:on

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * DID Resolver for Cardano Decentralized Identity - Java Implementation
 *
 * This class resolves Cardano-based DIDs (Decentralized Identifiers) following
 * the W3C DID Core specification.
 *
 * DID Format: did:cardano:preprod:<identity_nft_policy_id>
 *
 * @author Cardano Template Repository
 * @version 1.0.0
 */
public class DIDResolver {

  // ============================================================================
  // W3C DID DOCUMENT CLASSES
  // ============================================================================

  /**
   * W3C DID Document structure
   *
   * @see <a href="https://www.w3.org/TR/did-core/">W3C DID Core</a>
   */
  public record DIDDocument(
      List<String> context,
      String id,
      List<String> controller,
      List<VerificationMethod> verificationMethod,
      List<String> authentication,
      List<String> assertionMethod,
      List<String> keyAgreement,
      List<String> capabilityInvocation,
      List<String> capabilityDelegation,
      List<ServiceEndpoint> service,
      Map<String, Object> additionalProperties) {

    public DIDDocument {
      context = List.copyOf(context);
      controller = controller != null ? List.copyOf(controller) : List.of();
      verificationMethod = List.copyOf(verificationMethod);
      authentication = authentication != null ? List.copyOf(authentication) : List.of();
      assertionMethod = assertionMethod != null ? List.copyOf(assertionMethod) : List.of();
      keyAgreement = keyAgreement != null ? List.copyOf(keyAgreement) : List.of();
      capabilityInvocation = capabilityInvocation != null ? List.copyOf(capabilityInvocation) : List.of();
      capabilityDelegation = capabilityDelegation != null ? List.copyOf(capabilityDelegation) : List.of();
      service = service != null ? List.copyOf(service) : List.of();
      additionalProperties = additionalProperties != null ? Map.copyOf(additionalProperties) : Map.of();
    }
  }

  public record VerificationMethod(
      String id,
      String type,
      String controller,
      String publicKeyMultibase,
      String blockchainAccountId) {
  }

  public record ServiceEndpoint(String id, String type, String serviceEndpoint) {
  }

  // ============================================================================
  // DELEGATE AND ATTRIBUTE CLASSES
  // ============================================================================

  public record Delegate(String delegateAddress, String delegateType, long validUntil) {
    public boolean isValid(long currentTime) {
      return validUntil == 0 || validUntil > currentTime;
    }
  }

  public record Attribute(String name, String value, long validUntil) {
    public boolean isValid(long currentTime) {
      return validUntil == 0 || validUntil > currentTime;
    }
  }

  public record IdentityDatum(
      String identity,
      String owner,
      List<Delegate> delegates,
      List<Attribute> attributes,
      long nonce) {
  }

  // ============================================================================
  // DID RESOLVER
  // ============================================================================

  private final String network;
  private final Gson gson;

  /**
   * Creates a new DID resolver
   *
   * @param network Network identifier (mainnet, preprod, preview)
   */
  public DIDResolver(String network) {
    this.network = network;
    this.gson = new GsonBuilder().setPrettyPrinting().create();
  }

  /**
   * Resolves a DID to a DID Document
   *
   * @param did   The DID to resolve
   * @param datum The identity datum from chain
   * @return The resolved DID Document
   */
  public DIDDocument resolve(String did, IdentityDatum datum) {
    // Parse and validate DID format
    DIDParts didParts = parseDID(did);
    if (didParts == null) {
      throw new IllegalArgumentException("Invalid DID format: " + did);
    }

    if (!"cardano".equals(didParts.method)) {
      throw new IllegalArgumentException("Unsupported DID method: " + didParts.method);
    }

    if (!network.equals(didParts.network)) {
      throw new IllegalArgumentException(
          "Network mismatch: expected " + network + ", got " + didParts.network);
    }

    // Build DID Document
    return buildDIDDocument(did, datum);
  }

  /**
   * Parses a DID string into its components
   *
   * @param did The DID string
   * @return Parsed DID components or null if invalid
   */
  private DIDParts parseDID(String did) {
    // Expected format: did:cardano:<network>:<identifier>
    Pattern pattern = Pattern.compile("^did:([^:]+):([^:]+):([^:]+)$");
    Matcher matcher = pattern.matcher(did);

    if (!matcher.matches()) {
      return null;
    }

    return new DIDParts(matcher.group(1), matcher.group(2), matcher.group(3));
  }

  /**
   * Builds a W3C DID Document from identity datum
   *
   * @param did   The DID string
   * @param datum The identity datum from chain
   * @return Complete DID Document
   */
  private DIDDocument buildDIDDocument(String did, IdentityDatum datum) {
    long currentTime = System.currentTimeMillis();

    List<Delegate> validDelegates = datum.delegates.stream().filter(d -> d.isValid(currentTime))
        .collect(Collectors.toList());

    List<Attribute> validAttributes = datum.attributes.stream()
        .filter(a -> a.isValid(currentTime))
        .collect(Collectors.toList());

    // Build verification methods
    List<VerificationMethod> verificationMethods = new ArrayList<>();
    List<String> authentication = new ArrayList<>();
    List<String> assertionMethod = new ArrayList<>();
    List<String> keyAgreement = new ArrayList<>();

    // Add owner as primary verification method
    String ownerVMId = did + "#owner";
    verificationMethods.add(
        new VerificationMethod(
            ownerVMId,
            "Ed25519VerificationKey2020",
            did,
            null,
            "cardano:" + network + ":" + datum.owner));
    authentication.add(ownerVMId);
    assertionMethod.add(ownerVMId);

    // Add delegates as verification methods
    for (int i = 0; i < validDelegates.size(); i++) {
      Delegate delegate = validDelegates.get(i);
      String vmId = did + "#delegate-" + i;

      verificationMethods.add(
          new VerificationMethod(
              vmId,
              "Ed25519VerificationKey2020",
              did,
              null,
              "cardano:" + network + ":" + delegate.delegateAddress));

      // Map delegate types to verification relationships
      switch (delegate.delegateType) {
        case "veriKey" -> authentication.add(vmId);
        case "sigAuth" -> assertionMethod.add(vmId);
        case "enc" -> keyAgreement.add(vmId);
      }
    }

    // Extract service endpoints from attributes
    List<ServiceEndpoint> services = new ArrayList<>();
    for (int i = 0; i < validAttributes.size(); i++) {
      Attribute attr = validAttributes.get(i);
      if (attr.name.startsWith("did/svc/")) {
        String serviceName = attr.name.substring(8);
        services.add(new ServiceEndpoint(did + "#service-" + i, serviceName, attr.value));
      }
    }

    // Add custom attributes
    Map<String, Object> additionalProperties = new HashMap<>();
    Map<String, String> customAttrs = new HashMap<>();
    for (Attribute attr : validAttributes) {
      if (!attr.name.startsWith("did/")) {
        customAttrs.put(attr.name, attr.value);
      }
    }

    if (!customAttrs.isEmpty()) {
      Map<String, Object> cardanoIdentity = new HashMap<>();
      cardanoIdentity.put("network", network);
      cardanoIdentity.put("nonce", datum.nonce);
      cardanoIdentity.put("attributes", customAttrs);
      additionalProperties.put("cardanoIdentity", cardanoIdentity);
    }

    // Build complete DID Document
    return new DIDDocument(
        List.of("https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/ed25519-2020/v1"),
        did,
        List.of(did),
        verificationMethods,
        authentication,
        assertionMethod,
        keyAgreement.isEmpty() ? null : keyAgreement,
        List.of(ownerVMId),
        List.of(ownerVMId),
        services.isEmpty() ? null : services,
        additionalProperties);
  }

  /**
   * Generates a DID from an identity NFT policy ID
   *
   * @param policyId The identity NFT policy ID
   * @param network  Network identifier
   * @return The DID string
   */
  public static String generateDID(String policyId, String network) {
    return "did:cardano:" + network + ":" + policyId;
  }

  /**
   * Resolves a DID and returns a formatted JSON string
   *
   * @param did   The DID to resolve
   * @param datum The identity datum
   * @return Pretty-printed JSON DID Document
   */
  public String resolveToJSON(String did, IdentityDatum datum) {
    DIDDocument didDoc = resolve(did, datum);
    return gson.toJson(didDoc);
  }

  private record DIDParts(String method, String network, String identifier) {
  }

  // ============================================================================
  // MAIN - CLI INTERFACE
  // ============================================================================

  public static void main(String[] args) {
    if (args.length == 0) {
      System.out.println(
          """
              DID Resolver CLI (Java)

              Usage: jbang DIDResolver.java <command> [options]

              Commands:
                generate <policy_id> [network]    Generate a DID from policy ID
                help                              Show this help message

              Examples:
                jbang DIDResolver.java generate abc123def456... preprod
                jbang DIDResolver.java generate abc123def456... mainnet

              Note: To resolve a DID, use the DIDResolver class programmatically
              with an IdentityDatum from the blockchain.
              """);
      return;
    }

    String command = args[0];

    switch (command) {
      case "generate" -> {
        if (args.length < 2) {
          System.err.println("Usage: generate <policy_id> [network]");
          System.exit(1);
        }

        String policyId = args[1];
        String network = args.length > 2 ? args[2] : "preprod";
        String did = generateDID(policyId, network);
        System.out.println("Generated DID: " + did);
      }

      case "help" -> main(new String[0]);

      default -> {
        System.err.println("Unknown command: " + command);
        System.out.println("Run with no arguments for help.");
        System.exit(1);
      }
    }
  }
}
