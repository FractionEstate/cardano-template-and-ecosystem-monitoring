/// usr/bin/env jbang "$0" "$@" ; exit $?
///
// @formatter:off
//JAVA 24+
//COMPILE_OPTIONS --enable-preview -source 24
//RUNTIME_OPTIONS --enable-preview

//DEPS com.bloxbean.cardano:cardano-client-lib:0.7.0-beta2
//DEPS com.bloxbean.cardano:cardano-client-backend-blockfrost:0.7.0-beta2
//DEPS com.bloxbean.cardano:aiken-java-binding:0.1.0
// @formatter:on

import java.io.File;
import java.math.BigInteger;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.ByteBuffer;

import com.bloxbean.cardano.aiken.AikenScriptUtil;
import com.bloxbean.cardano.client.account.Account;
import com.bloxbean.cardano.client.address.Address;
import com.bloxbean.cardano.client.address.AddressProvider;
import com.bloxbean.cardano.client.api.UtxoSupplier;
import com.bloxbean.cardano.client.api.exception.ApiException;
import com.bloxbean.cardano.client.api.model.Amount;
import com.bloxbean.cardano.client.api.model.Utxo;
import com.bloxbean.cardano.client.backend.api.BackendService;
import com.bloxbean.cardano.client.backend.api.DefaultUtxoSupplier;
import com.bloxbean.cardano.client.backend.blockfrost.service.BFBackendService;
import com.bloxbean.cardano.client.common.model.Network;
import com.bloxbean.cardano.client.common.model.Networks;
import com.bloxbean.cardano.client.function.helper.SignerProviders;
import com.bloxbean.cardano.client.plutus.blueprint.PlutusBlueprintLoader;
import com.bloxbean.cardano.client.plutus.blueprint.PlutusBlueprintUtil;
import com.bloxbean.cardano.client.plutus.blueprint.model.PlutusContractBlueprint;
import com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion;
import com.bloxbean.cardano.client.plutus.blueprint.model.Validator;
import com.bloxbean.cardano.client.plutus.spec.BigIntPlutusData;
import com.bloxbean.cardano.client.plutus.spec.BytesPlutusData;
import com.bloxbean.cardano.client.plutus.spec.ConstrPlutusData;
import com.bloxbean.cardano.client.plutus.spec.ListPlutusData;
import com.bloxbean.cardano.client.plutus.spec.PlutusScript;
import com.bloxbean.cardano.client.quicktx.QuickTxBuilder;
import com.bloxbean.cardano.client.quicktx.ScriptTx;
import com.bloxbean.cardano.client.quicktx.Tx;
import com.bloxbean.cardano.client.quicktx.TxResult;
import com.bloxbean.cardano.client.util.HexUtil;

/**
 * Decentralized Identity - Cardano Client Lib (Java) Off-chain Implementation
 *
 * This implementation provides Java functions to interact with the
 * decentralized
 * identity smart contracts on Cardano. It implements EIP-1056 style identity
 * management including:
 * - Identity creation with unique NFT
 * - Ownership transfer
 * - Delegate management (add/revoke)
 * - Attribute management (set/revoke)
 *
 * Prerequisites:
 * - JBang installed for running as a script
 * - Blockfrost API endpoint (or local node)
 * - Compiled Aiken contracts (plutus.json)
 *
 * Usage:
 * jbang Identity.java
 *
 * @author Cardano Template Repository
 * @version 1.0.0
 */
public class Identity {

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  // Backend service configuration - replace with your Blockfrost endpoint
  static BackendService backendService = new BFBackendService(
      "http://localhost:8080/api/v1/",
      "Dummy Key");
  static UtxoSupplier utxoSupplier = new DefaultUtxoSupplier(backendService.getUtxoService());

  // Test mnemonic - replace with actual mnemonic for real usage
  static String mnemonic = "test test test test test test test test test test test test test test test test test test test test test test test sauce";

  // Network configuration - use Networks.mainnet() for mainnet
  static Network network = Networks.testnet();

  // Account derived from mnemonic
  static Account ownerAccount = Account.createFromMnemonic(network, mnemonic);
  static Address ownerAddress = ownerAccount.getBaseAddress();

  // Quick transaction builder
  static QuickTxBuilder quickTxBuilder = new QuickTxBuilder(backendService);

  // Contract references (set after loading blueprint)
  static PlutusScript identityNftScript;
  static PlutusScript identityValidatorScript;
  static String identityNftPolicyId;
  static Address identityScriptAddress;

  // ============================================================================
  // DELEGATE TYPE CONSTANTS
  // ============================================================================

  /** Verification key for off-chain signature verification */
  public static final String DELEGATE_TYPE_VERI_KEY = "veriKey";
  /** Signature authentication for on-chain authorization */
  public static final String DELEGATE_TYPE_SIG_AUTH = "sigAuth";
  /** Encryption key for key agreement */
  public static final String DELEGATE_TYPE_ENC = "enc";

  // ============================================================================
  // MAIN ENTRY POINT
  // ============================================================================

  public static void main(String[] args) throws Exception {
    System.out.println("=".repeat(60));
    System.out.println("Decentralized Identity - CCL Java Implementation");
    System.out.println("=".repeat(60));

    if (args.length == 0) {
      printUsage();
      return;
    }

    String command = args[0];

    switch (command) {
      case "create" -> createIdentityDemo();
      case "info" -> showIdentityInfo();
      case "add-delegate" -> {
        if (args.length < 4) {
          System.err.println("Usage: add-delegate <delegate_pkh> <type> <validity_days>");
          return;
        }
        addDelegateDemo(args[1], args[2], Integer.parseInt(args[3]));
      }
      case "set-attribute" -> {
        if (args.length < 4) {
          System.err.println("Usage: set-attribute <name> <value> <validity_days>");
          return;
        }
        setAttributeDemo(args[1], args[2], Integer.parseInt(args[3]));
      }
      case "test" -> runIntegrationTest();
      default -> printUsage();
    }
  }

  static void printUsage() {
    System.out.println("""
        Usage: jbang Identity.java <command> [options]

        Commands:
          create                                    Create a new identity
          info                                      Get identity information
          add-delegate <pkh> <type> <days>          Add a delegate
          set-attribute <name> <value> <days>       Set an attribute
          test                                      Run integration test

        Delegate Types:
          veriKey    - Verification key for signatures
          sigAuth    - Signature authentication
          enc        - Encryption key

        Examples:
          jbang Identity.java create
          jbang Identity.java add-delegate abc123... veriKey 30
          jbang Identity.java set-attribute name Alice 0
        """);
  }

  // ============================================================================
  // IDENTITY DATUM CLASSES
  // ============================================================================

  /**
   * Represents a delegate authorized to act on behalf of an identity
   */
  record Delegate(String delegateAddress, String delegateType, long validUntil) {
    ConstrPlutusData toPlutusData() {
      return ConstrPlutusData.builder()
          .alternative(0)
          .data(ListPlutusData.of(
              BytesPlutusData.of(HexUtil.decodeHexString(delegateAddress)),
              BytesPlutusData.of(delegateType.getBytes()),
              BigIntPlutusData.of(BigInteger.valueOf(validUntil))))
          .build();
    }

    boolean isValid(long currentTime) {
      return validUntil == 0 || validUntil > currentTime;
    }
  }

  /**
   * Represents an identity attribute
   */
  record Attribute(String name, String value, long validUntil) {
    ConstrPlutusData toPlutusData() {
      return ConstrPlutusData.builder()
          .alternative(0)
          .data(ListPlutusData.of(
              BytesPlutusData.of(name.getBytes()),
              BytesPlutusData.of(value.getBytes()),
              BigIntPlutusData.of(BigInteger.valueOf(validUntil))))
          .build();
    }

    boolean isValid(long currentTime) {
      return validUntil == 0 || validUntil > currentTime;
    }
  }

  /**
   * Represents the complete identity datum stored on-chain
   */
  record IdentityDatum(
      String identity,
      String owner,
      List<Delegate> delegates,
      List<Attribute> attributes,
      long nonce) {

    ConstrPlutusData toPlutusData() {
      ListPlutusData delegatesList = ListPlutusData.builder().build();
      for (Delegate d : delegates) {
        delegatesList.add(d.toPlutusData());
      }

      ListPlutusData attributesList = ListPlutusData.builder().build();
      for (Attribute a : attributes) {
        attributesList.add(a.toPlutusData());
      }

      return ConstrPlutusData.builder()
          .alternative(0)
          .data(ListPlutusData.of(
              BytesPlutusData.of(HexUtil.decodeHexString(identity)),
              BytesPlutusData.of(HexUtil.decodeHexString(owner)),
              delegatesList,
              attributesList,
              BigIntPlutusData.of(BigInteger.valueOf(nonce))))
          .build();
    }

    static IdentityDatum fromPlutusData(ConstrPlutusData data) {
      ListPlutusData fields = data.getData();
      String identity = HexUtil.encodeHexString(
          ((BytesPlutusData) fields.getPlutusDataList().get(0)).getValue());
      String owner = HexUtil.encodeHexString(
          ((BytesPlutusData) fields.getPlutusDataList().get(1)).getValue());

      List<Delegate> delegates = new ArrayList<>();
      ListPlutusData delegatesList = (ListPlutusData) fields.getPlutusDataList().get(2);
      for (var item : delegatesList.getPlutusDataList()) {
        ConstrPlutusData d = (ConstrPlutusData) item;
        ListPlutusData dFields = d.getData();
        delegates.add(new Delegate(
            HexUtil.encodeHexString(
                ((BytesPlutusData) dFields.getPlutusDataList().get(0)).getValue()),
            new String(((BytesPlutusData) dFields.getPlutusDataList().get(1)).getValue()),
            ((BigIntPlutusData) dFields.getPlutusDataList().get(2)).getValue().longValue()));
      }

      List<Attribute> attributes = new ArrayList<>();
      ListPlutusData attributesList = (ListPlutusData) fields.getPlutusDataList().get(3);
      for (var item : attributesList.getPlutusDataList()) {
        ConstrPlutusData a = (ConstrPlutusData) item;
        ListPlutusData aFields = a.getData();
        attributes.add(new Attribute(
            new String(((BytesPlutusData) aFields.getPlutusDataList().get(0)).getValue()),
            new String(((BytesPlutusData) aFields.getPlutusDataList().get(1)).getValue()),
            ((BigIntPlutusData) aFields.getPlutusDataList().get(2)).getValue().longValue()));
      }

      long nonce = ((BigIntPlutusData) fields.getPlutusDataList().get(4)).getValue().longValue();

      return new IdentityDatum(identity, owner, delegates, attributes, nonce);
    }

    IdentityDatum withNewOwner(String newOwner) {
      return new IdentityDatum(identity, newOwner, delegates, attributes, nonce + 1);
    }

    IdentityDatum withAddedDelegate(Delegate delegate) {
      List<Delegate> newDelegates = new ArrayList<>(delegates);
      newDelegates.removeIf(d -> d.delegateAddress().equals(delegate.delegateAddress())
          && d.delegateType().equals(delegate.delegateType()));
      newDelegates.add(delegate);
      return new IdentityDatum(identity, owner, newDelegates, attributes, nonce + 1);
    }

    IdentityDatum withRevokedDelegate(String delegateAddress, String delegateType) {
      List<Delegate> newDelegates = new ArrayList<>(delegates);
      newDelegates.removeIf(d -> d.delegateAddress().equals(delegateAddress)
          && d.delegateType().equals(delegateType));
      return new IdentityDatum(identity, owner, newDelegates, attributes, nonce + 1);
    }

    IdentityDatum withSetAttribute(Attribute attribute) {
      List<Attribute> newAttributes = new ArrayList<>(attributes);
      newAttributes.removeIf(a -> a.name().equals(attribute.name()));
      newAttributes.add(attribute);
      return new IdentityDatum(identity, owner, delegates, newAttributes, nonce + 1);
    }

    IdentityDatum withRevokedAttribute(String name, String value) {
      List<Attribute> newAttributes = new ArrayList<>(attributes);
      newAttributes.removeIf(a -> a.name().equals(name) && a.value().equals(value));
      return new IdentityDatum(identity, owner, delegates, newAttributes, nonce + 1);
    }

    List<Delegate> getValidDelegates() {
      long currentTime = Instant.now().toEpochMilli();
      return delegates.stream().filter(d -> d.isValid(currentTime)).toList();
    }

    List<Attribute> getValidAttributes() {
      long currentTime = Instant.now().toEpochMilli();
      return attributes.stream().filter(a -> a.isValid(currentTime)).toList();
    }
  }

  // ============================================================================
  // REDEEMER BUILDERS
  // ============================================================================

  /** Builds ChangeOwner redeemer (index 0) */
  static ConstrPlutusData changeOwnerRedeemer(String newOwnerPkh) {
    return ConstrPlutusData.builder()
        .alternative(0)
        .data(ListPlutusData.of(
            BytesPlutusData.of(HexUtil.decodeHexString(newOwnerPkh))))
        .build();
  }

  /** Builds AddDelegate redeemer (index 1) */
  static ConstrPlutusData addDelegateRedeemer(String delegateType, String delegatePkh, long validity) {
    return ConstrPlutusData.builder()
        .alternative(1)
        .data(ListPlutusData.of(
            BytesPlutusData.of(delegateType.getBytes()),
            BytesPlutusData.of(HexUtil.decodeHexString(delegatePkh)),
            BigIntPlutusData.of(BigInteger.valueOf(validity))))
        .build();
  }

  /** Builds RevokeDelegate redeemer (index 2) */
  static ConstrPlutusData revokeDelegateRedeemer(String delegateType, String delegatePkh) {
    return ConstrPlutusData.builder()
        .alternative(2)
        .data(ListPlutusData.of(
            BytesPlutusData.of(delegateType.getBytes()),
            BytesPlutusData.of(HexUtil.decodeHexString(delegatePkh))))
        .build();
  }

  /** Builds SetAttribute redeemer (index 3) */
  static ConstrPlutusData setAttributeRedeemer(String name, String value, long validity) {
    return ConstrPlutusData.builder()
        .alternative(3)
        .data(ListPlutusData.of(
            BytesPlutusData.of(name.getBytes()),
            BytesPlutusData.of(value.getBytes()),
            BigIntPlutusData.of(BigInteger.valueOf(validity))))
        .build();
  }

  /** Builds RevokeAttribute redeemer (index 4) */
  static ConstrPlutusData revokeAttributeRedeemer(String name, String value) {
    return ConstrPlutusData.builder()
        .alternative(4)
        .data(ListPlutusData.of(
            BytesPlutusData.of(name.getBytes()),
            BytesPlutusData.of(value.getBytes())))
        .build();
  }

  /** Builds CreateIdentity mint redeemer (index 0) */
  static ConstrPlutusData createIdentityMintRedeemer() {
    return ConstrPlutusData.builder()
        .alternative(0)
        .data(ListPlutusData.of())
        .build();
  }

  /** Builds DestroyIdentity mint redeemer (index 1) */
  static ConstrPlutusData destroyIdentityMintRedeemer() {
    return ConstrPlutusData.builder()
        .alternative(1)
        .data(ListPlutusData.of())
        .build();
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Computes the deterministic token name for an identity NFT
   * based on the UTXO reference used for one-shot minting.
   */
  static String computeIdentityTokenName(String txHash, int outputIndex) throws NoSuchAlgorithmException {
    byte[] txHashBytes = HexUtil.decodeHexString(txHash);
    ByteBuffer buffer = ByteBuffer.allocate(txHashBytes.length + 4);
    buffer.put(txHashBytes);
    buffer.putInt(outputIndex);

    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    byte[] hash = digest.digest(buffer.array());
    return HexUtil.encodeHexString(hash);
  }

  /**
   * Loads and parameterizes the validators from the compiled blueprint
   */
  static void loadValidators(String txHash, int outputIndex) throws NoSuchAlgorithmException {
    PlutusContractBlueprint blueprint = PlutusBlueprintLoader
        .loadBlueprint(new File("../../onchain/aiken/plutus.json"));

    // Find validators
    Validator nftValidator = blueprint.getValidators().stream()
        .filter(v -> v.getTitle().equals("identity_nft.identity_nft"))
        .findFirst()
        .orElseThrow(() -> new RuntimeException("NFT validator not found"));

    Validator spendValidator = blueprint.getValidators().stream()
        .filter(v -> v.getTitle().equals("identity.identity"))
        .findFirst()
        .orElseThrow(() -> new RuntimeException("Identity validator not found"));

    // Get identity validator hash first
    PlutusScript tempIdentityScript = PlutusBlueprintUtil.getPlutusScriptFromCompiledCode(
        spendValidator.getCompiledCode(), PlutusVersion.v3);
    String identityValidatorHash = HexUtil.encodeHexString(tempIdentityScript.getScriptHash());

    // Create output reference for NFT policy parameterization
    ConstrPlutusData outputRef = ConstrPlutusData.builder()
        .alternative(0)
        .data(ListPlutusData.of(
            BytesPlutusData.of(HexUtil.decodeHexString(txHash)),
            BigIntPlutusData.of(BigInteger.valueOf(outputIndex))))
        .build();

    // Apply parameters to NFT policy
    String nftPolicyCode = AikenScriptUtil.applyParamToScript(
        ListPlutusData.of(
            outputRef,
            BytesPlutusData.of(HexUtil.decodeHexString(identityValidatorHash))),
        nftValidator.getCompiledCode());

    identityNftScript = PlutusBlueprintUtil.getPlutusScriptFromCompiledCode(
        nftPolicyCode, PlutusVersion.v3);
    identityNftPolicyId = HexUtil.encodeHexString(identityNftScript.getScriptHash());

    // Compute token name
    String tokenName = computeIdentityTokenName(txHash, outputIndex);

    // Apply parameters to identity validator
    String identityCode = AikenScriptUtil.applyParamToScript(
        ListPlutusData.of(
            BytesPlutusData.of(HexUtil.decodeHexString(identityNftPolicyId)),
            BytesPlutusData.of(HexUtil.decodeHexString(tokenName))),
        spendValidator.getCompiledCode());

    identityValidatorScript = PlutusBlueprintUtil.getPlutusScriptFromCompiledCode(
        identityCode, PlutusVersion.v3);
    identityScriptAddress = AddressProvider.getEntAddress(identityValidatorScript, network);

    System.out.println("Validators loaded successfully:");
    System.out.println("  NFT Policy ID: " + identityNftPolicyId);
    System.out.println("  Script Address: " + identityScriptAddress.getAddress());
  }

  /**
   * Finds the identity UTXO at the script address
   */
  static Optional<Utxo> findIdentityUtxo() throws ApiException {
    List<Utxo> utxos = utxoSupplier.getAll(identityScriptAddress.getAddress());
    return utxos.stream()
        .filter(u -> u.getAmount().stream()
            .anyMatch(a -> a.getUnit().startsWith(identityNftPolicyId)))
        .findFirst();
  }

  // ============================================================================
  // IDENTITY OPERATIONS
  // ============================================================================

  /**
   * Creates a new decentralized identity
   */
  static TxResult createIdentity() throws Exception {
    System.out.println("\nCreating new identity...");

    // Get available UTXOs
    List<Utxo> utxos = utxoSupplier.getAll(ownerAddress.getAddress());
    Utxo selectedUtxo = utxos.stream()
        .filter(u -> u.getAmount().stream()
            .anyMatch(a -> a.getUnit().equals("lovelace")
                && Long.parseLong(a.getQuantity()) > 5_000_000L))
        .findFirst()
        .orElseThrow(() -> new RuntimeException("No suitable UTXO found"));

    // Load validators with selected UTXO
    loadValidators(selectedUtxo.getTxHash(), selectedUtxo.getOutputIndex());

    // Compute token name
    String tokenName = computeIdentityTokenName(
        selectedUtxo.getTxHash(), selectedUtxo.getOutputIndex());
    String tokenUnit = identityNftPolicyId + tokenName;

    // Get owner's payment credential hash
    String ownerPkh = HexUtil.encodeHexString(ownerAddress.getPaymentCredentialHash().get());

    // Create initial datum
    IdentityDatum initialDatum = new IdentityDatum(
        ownerPkh, ownerPkh, List.of(), List.of(), 0);

    System.out.println("  Identity: " + ownerPkh);
    System.out.println("  Token: " + tokenUnit);

    // Build and submit transaction
    Tx tx = new Tx()
        .payToContract(
            identityScriptAddress.getAddress(),
            List.of(Amount.ada(2), new Amount(tokenUnit, BigInteger.ONE)),
            initialDatum.toPlutusData())
        .mintAssets(
            identityNftScript,
            new Amount(tokenUnit, BigInteger.ONE),
            createIdentityMintRedeemer())
        .from(ownerAddress.getAddress());

    TxResult result = quickTxBuilder.compose(tx)
        .feePayer(ownerAddress.getAddress())
        .withSigner(SignerProviders.signerFrom(ownerAccount))
        .withRequiredSigners(ownerAddress)
        .completeAndWait();

    System.out.println("  TxHash: " + result.getTxHash());
    System.out.println("  Success: " + result.isSuccessful());

    return result;
  }

  /**
   * Changes identity ownership
   */
  static TxResult changeOwner(String newOwnerPkh) throws Exception {
    System.out.println("\nChanging identity owner to: " + newOwnerPkh);

    Utxo identityUtxo = findIdentityUtxo()
        .orElseThrow(() -> new RuntimeException("Identity UTXO not found"));

    // Get current datum and create new datum
    IdentityDatum currentDatum = IdentityDatum.fromPlutusData(
        (ConstrPlutusData) identityUtxo.getInlineDatum());
    IdentityDatum newDatum = currentDatum.withNewOwner(newOwnerPkh);

    // Find token
    String tokenUnit = identityUtxo.getAmount().stream()
        .filter(a -> a.getUnit().startsWith(identityNftPolicyId))
        .findFirst()
        .map(Amount::getUnit)
        .orElseThrow();

    ScriptTx scriptTx = new ScriptTx()
        .collectFrom(List.of(identityUtxo), changeOwnerRedeemer(newOwnerPkh))
        .payToContract(
            identityScriptAddress.getAddress(),
            List.of(Amount.ada(2), new Amount(tokenUnit, BigInteger.ONE)),
            newDatum.toPlutusData())
        .attachSpendingValidator(identityValidatorScript);

    return quickTxBuilder.compose(scriptTx)
        .feePayer(ownerAddress.getAddress())
        .withSigner(SignerProviders.signerFrom(ownerAccount))
        .withRequiredSigners(ownerAddress)
        .completeAndWait();
  }

  /**
   * Adds a delegate to the identity
   */
  static TxResult addDelegate(String delegateType, String delegatePkh, int validityDays) throws Exception {
    System.out.println("\nAdding delegate: " + delegatePkh + " (" + delegateType + ")");

    Utxo identityUtxo = findIdentityUtxo()
        .orElseThrow(() -> new RuntimeException("Identity UTXO not found"));

    IdentityDatum currentDatum = IdentityDatum.fromPlutusData(
        (ConstrPlutusData) identityUtxo.getInlineDatum());

    // Calculate validity
    long currentTime = Instant.now().toEpochMilli();
    long validUntil = validityDays == 0 ? 0 : currentTime + (validityDays * 24L * 60 * 60 * 1000);
    long validityMs = validityDays == 0 ? 0 : (long) validityDays * 24 * 60 * 60 * 1000;

    Delegate newDelegate = new Delegate(delegatePkh, delegateType, validUntil);
    IdentityDatum newDatum = currentDatum.withAddedDelegate(newDelegate);

    String tokenUnit = identityUtxo.getAmount().stream()
        .filter(a -> a.getUnit().startsWith(identityNftPolicyId))
        .findFirst()
        .map(Amount::getUnit)
        .orElseThrow();

    long slot = backendService.getBlockService().getLatestBlock().getValue().getSlot();

    ScriptTx scriptTx = new ScriptTx()
        .collectFrom(List.of(identityUtxo), addDelegateRedeemer(delegateType, delegatePkh, validityMs))
        .payToContract(
            identityScriptAddress.getAddress(),
            List.of(Amount.ada(2), new Amount(tokenUnit, BigInteger.ONE)),
            newDatum.toPlutusData())
        .attachSpendingValidator(identityValidatorScript);

    return quickTxBuilder.compose(scriptTx)
        .validFrom(slot - 100)
        .validTo(slot + 1000)
        .feePayer(ownerAddress.getAddress())
        .withSigner(SignerProviders.signerFrom(ownerAccount))
        .withRequiredSigners(ownerAddress)
        .completeAndWait();
  }

  /**
   * Revokes a delegate from the identity
   */
  static TxResult revokeDelegate(String delegateType, String delegatePkh) throws Exception {
    System.out.println("\nRevoking delegate: " + delegatePkh + " (" + delegateType + ")");

    Utxo identityUtxo = findIdentityUtxo()
        .orElseThrow(() -> new RuntimeException("Identity UTXO not found"));

    IdentityDatum currentDatum = IdentityDatum.fromPlutusData(
        (ConstrPlutusData) identityUtxo.getInlineDatum());
    IdentityDatum newDatum = currentDatum.withRevokedDelegate(delegatePkh, delegateType);

    String tokenUnit = identityUtxo.getAmount().stream()
        .filter(a -> a.getUnit().startsWith(identityNftPolicyId))
        .findFirst()
        .map(Amount::getUnit)
        .orElseThrow();

    ScriptTx scriptTx = new ScriptTx()
        .collectFrom(List.of(identityUtxo), revokeDelegateRedeemer(delegateType, delegatePkh))
        .payToContract(
            identityScriptAddress.getAddress(),
            List.of(Amount.ada(2), new Amount(tokenUnit, BigInteger.ONE)),
            newDatum.toPlutusData())
        .attachSpendingValidator(identityValidatorScript);

    return quickTxBuilder.compose(scriptTx)
        .feePayer(ownerAddress.getAddress())
        .withSigner(SignerProviders.signerFrom(ownerAccount))
        .withRequiredSigners(ownerAddress)
        .completeAndWait();
  }

  /**
   * Sets an attribute on the identity
   */
  static TxResult setAttribute(String name, String value, int validityDays) throws Exception {
    System.out.println("\nSetting attribute: " + name + " = " + value);

    Utxo identityUtxo = findIdentityUtxo()
        .orElseThrow(() -> new RuntimeException("Identity UTXO not found"));

    IdentityDatum currentDatum = IdentityDatum.fromPlutusData(
        (ConstrPlutusData) identityUtxo.getInlineDatum());

    long currentTime = Instant.now().toEpochMilli();
    long validUntil = validityDays == 0 ? 0 : currentTime + (validityDays * 24L * 60 * 60 * 1000);
    long validityMs = validityDays == 0 ? 0 : (long) validityDays * 24 * 60 * 60 * 1000;

    Attribute newAttribute = new Attribute(name, value, validUntil);
    IdentityDatum newDatum = currentDatum.withSetAttribute(newAttribute);

    String tokenUnit = identityUtxo.getAmount().stream()
        .filter(a -> a.getUnit().startsWith(identityNftPolicyId))
        .findFirst()
        .map(Amount::getUnit)
        .orElseThrow();

    long slot = backendService.getBlockService().getLatestBlock().getValue().getSlot();

    ScriptTx scriptTx = new ScriptTx()
        .collectFrom(List.of(identityUtxo), setAttributeRedeemer(name, value, validityMs))
        .payToContract(
            identityScriptAddress.getAddress(),
            List.of(Amount.ada(2), new Amount(tokenUnit, BigInteger.ONE)),
            newDatum.toPlutusData())
        .attachSpendingValidator(identityValidatorScript);

    return quickTxBuilder.compose(scriptTx)
        .validFrom(slot - 100)
        .validTo(slot + 1000)
        .feePayer(ownerAddress.getAddress())
        .withSigner(SignerProviders.signerFrom(ownerAccount))
        .withRequiredSigners(ownerAddress)
        .completeAndWait();
  }

  /**
   * Revokes an attribute from the identity
   */
  static TxResult revokeAttribute(String name, String value) throws Exception {
    System.out.println("\nRevoking attribute: " + name + " = " + value);

    Utxo identityUtxo = findIdentityUtxo()
        .orElseThrow(() -> new RuntimeException("Identity UTXO not found"));

    IdentityDatum currentDatum = IdentityDatum.fromPlutusData(
        (ConstrPlutusData) identityUtxo.getInlineDatum());
    IdentityDatum newDatum = currentDatum.withRevokedAttribute(name, value);

    String tokenUnit = identityUtxo.getAmount().stream()
        .filter(a -> a.getUnit().startsWith(identityNftPolicyId))
        .findFirst()
        .map(Amount::getUnit)
        .orElseThrow();

    ScriptTx scriptTx = new ScriptTx()
        .collectFrom(List.of(identityUtxo), revokeAttributeRedeemer(name, value))
        .payToContract(
            identityScriptAddress.getAddress(),
            List.of(Amount.ada(2), new Amount(tokenUnit, BigInteger.ONE)),
            newDatum.toPlutusData())
        .attachSpendingValidator(identityValidatorScript);

    return quickTxBuilder.compose(scriptTx)
        .feePayer(ownerAddress.getAddress())
        .withSigner(SignerProviders.signerFrom(ownerAccount))
        .withRequiredSigners(ownerAddress)
        .completeAndWait();
  }

  // ============================================================================
  // DEMO FUNCTIONS
  // ============================================================================

  static void createIdentityDemo() throws Exception {
    TxResult result = createIdentity();
    if (result.isSuccessful()) {
      System.out.println("\n✓ Identity created successfully!");
    } else {
      System.out.println("\n✗ Failed to create identity: " + result.getResponse());
    }
  }

  static void showIdentityInfo() throws Exception {
    System.out.println("\nIdentity Information:");
    Utxo identityUtxo = findIdentityUtxo()
        .orElseThrow(() -> new RuntimeException("Identity not found"));

    IdentityDatum datum = IdentityDatum.fromPlutusData(
        (ConstrPlutusData) identityUtxo.getInlineDatum());

    System.out.println("  Identity: " + datum.identity());
    System.out.println("  Owner: " + datum.owner());
    System.out.println("  Nonce: " + datum.nonce());

    System.out.println("\n  Valid Delegates:");
    for (Delegate d : datum.getValidDelegates()) {
      System.out.println("    - " + d.delegateAddress() + " (" + d.delegateType() + ")");
    }

    System.out.println("\n  Valid Attributes:");
    for (Attribute a : datum.getValidAttributes()) {
      System.out.println("    - " + a.name() + " = " + a.value());
    }
  }

  static void addDelegateDemo(String delegatePkh, String delegateType, int validityDays) throws Exception {
    TxResult result = addDelegate(delegateType, delegatePkh, validityDays);
    System.out.println("Success: " + result.isSuccessful());
    System.out.println("TxHash: " + result.getTxHash());
  }

  static void setAttributeDemo(String name, String value, int validityDays) throws Exception {
    TxResult result = setAttribute(name, value, validityDays);
    System.out.println("Success: " + result.isSuccessful());
    System.out.println("TxHash: " + result.getTxHash());
  }

  static void runIntegrationTest() throws Exception {
    System.out.println("\n" + "=".repeat(60));
    System.out.println("Running Integration Test");
    System.out.println("=".repeat(60));

    // Step 1: Create identity
    TxResult createResult = createIdentity();
    assert createResult.isSuccessful() : "Identity creation failed";
    System.out.println("✓ Identity created");

    Thread.sleep(20000); // Wait for confirmation

    // Step 2: Add delegate
    String delegatePkh = "1234567890abcdef1234567890abcdef1234567890abcdef12345678";
    TxResult addDelegateResult = addDelegate(DELEGATE_TYPE_VERI_KEY, delegatePkh, 30);
    assert addDelegateResult.isSuccessful() : "Add delegate failed";
    System.out.println("✓ Delegate added");

    Thread.sleep(20000);

    // Step 3: Set attribute
    TxResult setAttrResult = setAttribute("name", "Alice", 0);
    assert setAttrResult.isSuccessful() : "Set attribute failed";
    System.out.println("✓ Attribute set");

    Thread.sleep(20000);

    // Step 4: Verify state
    showIdentityInfo();

    System.out.println("\n" + "=".repeat(60));
    System.out.println("Integration Test Completed Successfully!");
    System.out.println("=".repeat(60));
  }
}
