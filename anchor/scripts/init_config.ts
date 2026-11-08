/**
 * Admin operations on the protocol Config (arbiter + admin).
 *
 * Run from the anchor/ folder:
 *   export NODE_OPTIONS=--no-experimental-strip-types
 *   export ANCHOR_PROVIDER_URL=<rpc url>
 *   export ANCHOR_WALLET=<path to the UPGRADE AUTHORITY keypair>   # signs these txs
 *   npx ts-node scripts/init_config.ts show
 *   CONFIRM=yes npx ts-node scripts/init_config.ts init <ARBITER_PUBKEY>
 *   CONFIRM=yes npx ts-node scripts/init_config.ts set-arbiter <ARBITER_PUBKEY>
 *   CONFIRM=yes npx ts-node scripts/init_config.ts set-admin <NEW_ADMIN_PUBKEY>
 *
 * Writes refuse to run without CONFIRM=yes, and print exactly where they are
 * about to write first. `init` can only succeed for the program's upgrade
 * authority. `set-admin` is irreversible if you give it the wrong address.
 */
import * as anchor from "@anchor-lang/core";
import { AnchorProvider, Program } from "@anchor-lang/core";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!cmd || !["show", "init", "set-arbiter", "set-admin"].includes(cmd)) {
    console.error("usage: init_config.ts <show | init <arbiter> | set-arbiter <arbiter> | set-admin <pubkey>>");
    process.exit(1);
  }
  const provider = AnchorProvider.local(process.env.ANCHOR_PROVIDER_URL, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = anchor.workspace.EthosEscrow as Program<any>;
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const [programData] = PublicKey.findProgramAddressSync([program.programId.toBuffer()], BPF_LOADER);

  console.log("RPC:      ", provider.connection.rpcEndpoint.replace(/api-key=[^&]+/, "api-key=***"));
  console.log("Wallet:   ", provider.wallet.publicKey.toBase58());
  console.log("Program:  ", program.programId.toBase58());
  console.log("Config:   ", configPda.toBase58());

  if (cmd === "show") {
    const info = await provider.connection.getAccountInfo(configPda);
    if (!info) return console.log("Config does not exist yet. Run `init <ARBITER_PUBKEY>` as the upgrade authority.");
    const c: any = await (program.account as any).config.fetch(configPda);
    console.log("Admin:    ", c.admin.toBase58());
    console.log("Arbiter:  ", c.arbiter.toBase58());
    return;
  }

  if (!arg) throw new Error("this command needs a public key argument");
  const target = new PublicKey(arg); // validates the address format
  if (process.env.CONFIRM !== "yes") {
    console.log(`\nDRY RUN: would run '${cmd}' with ${target.toBase58()}. Re-run with CONFIRM=yes to send it.`);
    return;
  }
  let sig: string;
  if (cmd === "init") {
    sig = await program.methods
      .initializeConfig(target)
      .accountsPartial({ admin: provider.wallet.publicKey, config: configPda, program: program.programId, programData, systemProgram: SystemProgram.programId })
      .rpc();
  } else if (cmd === "set-arbiter") {
    sig = await program.methods.setArbiter(target).accountsPartial({ admin: provider.wallet.publicKey, config: configPda }).rpc();
  } else {
    sig = await program.methods.setAdmin(target).accountsPartial({ admin: provider.wallet.publicKey, config: configPda }).rpc();
  }
  console.log("Done. Signature:", sig);
}
main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
