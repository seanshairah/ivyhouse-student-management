/**
 * Paynow configuration doctor.
 *
 * Payments were failing on every rail at once — EcoCash prompts cancelled by
 * the network seconds after being sent, card payments never advancing past
 * Paynow's own hosted page — while the merchant account was, correctly,
 * reported as live. Nothing in this codebase could tell the two apart, because
 * the only party who knows whether an integration is live is Paynow, and the
 * app deliberately never shows a student a raw provider error.
 *
 * That protection had a cost: the operator could not see the raw error either.
 * This script is the missing view. It talks to Paynow using the real
 * production code path — the same getPaynowConfig(), the same signing, the
 * same endpoint — and prints exactly what comes back, unedited.
 *
 * Run it where the real environment variables are:
 *
 *   npx tsx scripts/paynow-doctor.ts
 *   npx tsx scripts/paynow-doctor.ts --express=0771234567
 *
 * Safety: the default run only calls `initiatetransaction`, which creates a
 * checkout link and nothing else. No money moves, nobody is charged, and no
 * phone is prompted — the link this produces is never opened. The `--express`
 * probe is opt-in precisely because it DOES push a real USSD prompt to the
 * number you name, so only ever point it at a handset you hold.
 */
import { createPaynowPayment, createPaynowMobilePayment, getPaynowConfig, type MobileMethod } from "../src/services/payments/paynow";

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", OFF = "\x1b[0m";
const ok = (s: string) => console.log(`${GREEN}  PASS${OFF}  ${s}`);
const bad = (s: string) => console.log(`${RED}  FAIL${OFF}  ${s}`);
const warn = (s: string) => console.log(`${YELLOW}  WARN${OFF}  ${s}`);
const note = (s: string) => console.log(`${DIM}        ${s}${OFF}`);
const head = (s: string) => console.log(`\n${s}\n${"-".repeat(s.length)}`);

/** Enough of a secret to recognise which one it is; never the whole thing. */
function tail(v: string | undefined): string {
  if (!v) return "(unset)";
  return v.length <= 4 ? "****" : `…${v.slice(-4)} (${v.length} chars)`;
}

/**
 * An address that is deliverable but is definitely NOT the merchant's own.
 *
 * This is the whole trick. While an integration is in test mode Paynow refuses
 * any authemail other than the merchant's registered address, and says so in
 * as many words. A live integration accepts anything deliverable. So the
 * response to this one field is a clean yes/no on test mode — the question
 * that decides whether the problem is our configuration or the account.
 */
const PROBE_EMAIL = "paynow.doctor.probe@gmail.com";

async function main() {
  const expressArg = process.argv.find((a) => a.startsWith("--express="));
  const phone = expressArg?.split("=")[1];
  const method = (process.argv.find((a) => a.startsWith("--method="))?.split("=")[1] ??
    "ecocash") as MobileMethod;

  console.log("\n=== Paynow doctor ===");

  head("1. Configuration");
  let config: ReturnType<typeof getPaynowConfig>;
  try {
    config = getPaynowConfig();
  } catch (e) {
    bad(`getPaynowConfig() threw: ${(e as Error).message}`);
    note("Payments cannot run at all until this is resolved.");
    process.exit(1);
  }

  const usdId = process.env.PAYNOW_USD_INTEGRATION_ID;
  const genId = process.env.PAYNOW_INTEGRATION_ID;
  console.log(`  mode                        ${config.mode}`);
  console.log(`  currency                    ${config.currency}`);
  console.log(`  PAYNOW_USD_INTEGRATION_ID   ${usdId || "(unset)"}`);
  console.log(`  PAYNOW_INTEGRATION_ID       ${genId || "(unset)"}`);
  console.log(`  integration id IN USE       ${config.integrationId || "(none)"}`);
  console.log(`  integration key IN USE      ${tail(config.integrationKey)}`);
  console.log(`  returnUrl                   ${config.returnUrl}`);
  console.log(`  resultUrl                   ${config.resultUrl}`);
  console.log(`  APP_URL                     ${process.env.APP_URL || "(unset)"}`);
  console.log(`  PAYNOW_AUTH_EMAIL           ${process.env.PAYNOW_AUTH_EMAIL || "(unset)"}`);

  if (config.mode !== "live") {
    warn("PAYNOW_MODE is not 'live' — this run talks to nobody and proves nothing.");
    process.exit(0);
  }
  if (usdId && genId && usdId !== genId) {
    warn(`Two different integration IDs are set. ${usdId} (USD) wins; ${genId} is ignored.`);
    note("If the live one is the other, payments are going to an integration you are not watching.");
  }
  if (/localhost|127\.0\.0\.1/.test(config.resultUrl)) {
    bad("resultUrl points at localhost — Paynow cannot deliver payment results there.");
  } else ok("resultUrl is publicly addressable.");
  if (process.env.PAYNOW_AUTH_EMAIL) {
    warn("PAYNOW_AUTH_EMAIL is set. It forces every confirmation to that address.");
    note("Only needed while an integration is in test mode. Unset it once live.");
  }

  head("2. Is this integration live, or still in test mode?");
  note(`Sending initiatetransaction with authemail=${PROBE_EMAIL}`);
  note("No money moves and nobody is prompted — this only asks for a checkout link.");

  const ref = `DOCTOR-${Date.now().toString(36).toUpperCase()}`;
  const probe = await createPaynowPayment({
    reference: ref,
    amount: 1,
    email: PROBE_EMAIL,
    description: "Paynow integration doctor probe — not a real payment",
    authEmailOverride: PROBE_EMAIL,
  });

  console.log(`\n  reference       ${ref}`);
  console.log(`  ok              ${probe.ok}`);
  if (probe.providerRef) console.log(`  paynowreference ${probe.providerRef}`);
  if (probe.providerError) console.log(`  RAW PAYNOW SAYS ${RED}${probe.providerError}${OFF}`);
  if (probe.ambiguous) console.log(`  ambiguous       ${probe.ambiguous} (network problem, not a decline)`);

  const raw = (probe.providerError ?? "").toLowerCase();
  let testMode: boolean | null = null;
  if (raw.includes("test mode") || (raw.includes("authemail") && raw.includes("match"))) {
    testMode = true;
  } else if (probe.ok) {
    testMode = false;
  }

  if (testMode === true) {
    bad("THIS INTEGRATION IS IN TEST MODE.");
    note("A merchant account can be fully live while an individual integration is not.");
    note("Test mode is per-integration: Paynow dashboard → 3rd Party / Integrations →");
    note(`  open integration ${config.integrationId} → turn Test Mode OFF.`);
    note("While it is on, EcoCash accepts only Paynow's four test numbers, so a real");
    note("registered wallet is rejected as unregistered — and cards will not settle.");
  } else if (testMode === false) {
    ok("Integration is LIVE for web checkout — Paynow issued a real checkout link.");
    note(`Checkout link: ${probe.redirectUrl}`);
    note("Open it in a browser to see which payment methods the account actually offers.");
    note("If Zimswitch/Visa is missing or errors there, that method is not enabled on");
    note("the merchant account — Paynow support enables it, no code change helps.");
  } else {
    warn("Could not classify. Paynow's exact words are printed above — send them to support.");
  }

  if (!phone) {
    head("3. Mobile money (skipped)");
    note("Re-run with --express=07XXXXXXXX to push ONE real prompt to a handset you hold.");
    note("Optionally --method=ecocash|onemoney|innbucks (default ecocash).");
  } else {
    head("3. Mobile money (live prompt)");
    warn(`Pushing a real ${method} prompt to ${phone}. Approving it WOULD take money.`);
    const mref = `DOCTOR-M-${Date.now().toString(36).toUpperCase()}`;
    const m = await createPaynowMobilePayment({
      reference: mref,
      amount: 1,
      email: PROBE_EMAIL,
      description: "Paynow integration doctor probe — decline this",
      phone,
      method,
    });
    console.log(`\n  reference       ${mref}`);
    console.log(`  ok              ${m.ok}`);
    if (m.providerRef) console.log(`  paynowreference ${m.providerRef}`);
    if (m.pollUrl) console.log(`  pollUrl         ${m.pollUrl}`);
    if (m.providerError) console.log(`  RAW PAYNOW SAYS ${RED}${m.providerError}${OFF}`);
    if (m.ok) {
      ok("Paynow accepted the prompt. Poll the URL above to see what the network did.");
      note("Accepted-then-Cancelled within seconds means the network refused it, which is");
      note("what test mode looks like from here — check section 2 above.");
    } else {
      bad("Paynow refused the prompt outright. Its exact words are above.");
    }
  }

  console.log("");
}

main().catch((e) => {
  console.error("\ndoctor failed:", e);
  process.exit(1);
});
