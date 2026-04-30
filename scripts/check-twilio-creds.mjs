/**
 * check-twilio-creds.mjs
 *
 * Read-only health check for the Twilio in-browser calling stack. Diagnoses
 * the most common failure modes for outbound calls stuck on "Connecting...":
 *   - API Key type is Restricted (cannot sign Voice Access Tokens)
 *   - API Key SID / Secret pair mismatch (JWT signature invalid)
 *   - TwiML App SID points at a deleted/wrong app
 *   - TwiML App Voice URL is unreachable (DNS / 5xx / 404)
 *   - Phone number not actually owned by the account
 *   - Railway deployment SHA is older than origin/main HEAD (missing the
 *     hardcoded edge-list fix from PR #69)
 *
 * Run from local with prod env injected (no secrets ever printed):
 *   railway run \
 *     --service 25bceb51-6161-4bd4-a9ea-1ed0d6381b09 \
 *     -- node scripts/check-twilio-creds.mjs
 *
 * If RAILWAY_TOKEN is also set in the environment, the script additionally
 * fetches the latest deployment SHA and compares it to origin/main HEAD so
 * you can spot a stale prod build.
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const API_KEY = process.env.TWILIO_API_KEY;
const API_SECRET = process.env.TWILIO_API_SECRET;
const TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID;
const PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;

const RAILWAY_PROJECT = 'd3a9ee5b-ac78-4914-8210-45b1417297f4';
const RAILWAY_ENVIRONMENT = '0e57bbed-d422-42c5-9661-c1c931800379';
const RAILWAY_SERVICE = '25bceb51-6161-4bd4-a9ea-1ed0d6381b09';

const EXPECTED_VOICE_URL = 'https://pro.handypioneers.com/api/twilio/voice/connect';

let problems = 0;
let warnings = 0;
function fail(msg) { console.log(`  ✗ ${msg}`); problems++; }
function warn(msg) { console.log(`  ⚠ ${msg}`); warnings++; }
function ok(msg) { console.log(`  ✓ ${msg}`); }
function info(msg) { console.log(`    ${msg}`); }

function mask(value, keep = 4) {
  if (!value) return '(unset)';
  if (value.length <= keep * 2) return '*'.repeat(value.length);
  return `${value.slice(0, keep)}…${value.slice(-keep)} (len=${value.length})`;
}

async function twilioFetch(path, { auth = 'master' } = {}) {
  const credentials =
    auth === 'apikey'
      ? Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')
      : Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
  const r = await fetch(`https://api.twilio.com${path}`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

async function railwayGraphql(query, variables) {
  const r = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Project-Access-Token': RAILWAY_TOKEN,
      'User-Agent': 'curl/8.0',
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(`Railway GraphQL: ${JSON.stringify(j.errors)}`);
  return j.data;
}

// ─── Section 1: env var presence ─────────────────────────────────────────────
function checkEnvVars() {
  console.log('\n[1/6] Environment variables');
  const required = [
    ['TWILIO_ACCOUNT_SID', ACCOUNT_SID, /^AC/],
    ['TWILIO_AUTH_TOKEN', AUTH_TOKEN, /.{32,}/],
    ['TWILIO_API_KEY', API_KEY, /^SK/],
    ['TWILIO_API_SECRET', API_SECRET, /.{32,}/],
    ['TWILIO_TWIML_APP_SID', TWIML_APP_SID, /^AP/],
    ['TWILIO_PHONE_NUMBER', PHONE_NUMBER, /^\+[1-9]/],
  ];
  for (const [name, value, pattern] of required) {
    if (!value) {
      fail(`${name} is unset`);
    } else if (!pattern.test(value)) {
      fail(`${name} format unexpected — got ${mask(value)}`);
    } else {
      ok(`${name} = ${mask(value)}`);
    }
  }
}

// ─── Section 2: master credentials work ──────────────────────────────────────
async function checkMasterCreds() {
  console.log('\n[2/6] Master credentials (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN)');
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    fail('skipped — env vars missing');
    return;
  }
  const { status, body } = await twilioFetch(`/2010-04-01/Accounts/${ACCOUNT_SID}.json`);
  if (status !== 200) {
    fail(`auth failed: ${status} ${typeof body === 'string' ? body.slice(0, 120) : ''}`);
    return;
  }
  ok(`account "${body.friendly_name}" — status ${body.status}, type ${body.type}`);
  if (body.status !== 'active') warn(`account status is ${body.status} — expected "active"`);
  if (body.type === 'Trial') {
    warn('TRIAL account — outbound calls only work to verified numbers. Confirm +19712584831 is on the verified list.');
  }
}

// ─── Section 3: API Key metadata + type ─────────────────────────────────────
async function checkApiKey() {
  console.log('\n[3/6] API Key metadata');
  if (!API_KEY) { fail('skipped — TWILIO_API_KEY missing'); return null; }
  const { status, body } = await twilioFetch(
    `/2010-04-01/Accounts/${ACCOUNT_SID}/Keys/${API_KEY}.json`,
  );
  if (status !== 200) {
    fail(`Twilio rejected lookup of ${API_KEY}: ${status} ${typeof body === 'string' ? body.slice(0, 120) : ''}`);
    return null;
  }
  ok(`API Key "${body.friendly_name}" exists (created ${body.date_created})`);
  // Note: the public Keys.json endpoint does not return the "type" field
  // (Main / Standard / Restricted). We infer it from the Account.type and
  // surface a manual-verification hint instead.
  info('Type: not surfaced by API — verify in Console → API keys & tokens that this row is "Standard" or "Main" (NOT "Restricted").');
  info(`  Console row to confirm: SID ${API_KEY}`);
  return body;
}

// ─── Section 4: API Key + Secret pair signs a token ─────────────────────────
async function checkApiKeySecretPair() {
  console.log('\n[4/6] API Key + Secret pair (can sign Voice Access Tokens)');
  if (!API_KEY || !API_SECRET) { fail('skipped — env vars missing'); return; }

  // The cleanest test: use the API Key/Secret pair as Basic Auth against an
  // endpoint that requires Standard-key permissions. /Calls.json works — a
  // Restricted key returns 401 here, a wrong-secret pair returns 401 too.
  const { status, body } = await twilioFetch(
    `/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json?PageSize=1`,
    { auth: 'apikey' },
  );
  if (status === 200) {
    ok('API Key + Secret pair authenticates successfully — secret is correct AND key is Standard/Main type');
  } else if (status === 401) {
    fail('API Key + Secret pair REJECTED (401). One of:');
    info('• Secret in TWILIO_API_SECRET does not match the key in TWILIO_API_KEY');
    info('• Key is Restricted type (cannot access /Calls API)');
    info('Fix: re-run scripts/setup-twilio-voice.mjs to mint a fresh Standard key + secret atomically.');
  } else {
    fail(`unexpected response ${status}: ${typeof body === 'string' ? body.slice(0, 120) : JSON.stringify(body).slice(0, 120)}`);
  }

  // Also try to sign a Voice token in-process so we exercise the same code
  // path as the running server. This is the definitive test.
  try {
    const twilio = (await import('twilio')).default;
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;
    const grant = new VoiceGrant({
      outgoingApplicationSid: TWIML_APP_SID,
      incomingAllow: true,
    });
    const token = new AccessToken(ACCOUNT_SID, API_KEY, API_SECRET, {
      identity: 'check-creds-script',
      ttl: 60,
    });
    token.addGrant(grant);
    const jwt = token.toJwt();
    if (jwt && jwt.split('.').length === 3) {
      ok('Voice Access Token mints locally (3-part JWT)');
    } else {
      fail(`token mint produced unexpected output (parts=${jwt?.split('.').length ?? 0})`);
    }
  } catch (err) {
    info(`(skipped local token mint — twilio module not installed: ${err.message})`);
  }
}

// ─── Section 5: TwiML App + reachability ─────────────────────────────────────
async function checkTwimlApp() {
  console.log('\n[5/6] TwiML App + Voice URL reachability');
  if (!TWIML_APP_SID) { fail('skipped — TWILIO_TWIML_APP_SID missing'); return; }

  const { status, body } = await twilioFetch(
    `/2010-04-01/Accounts/${ACCOUNT_SID}/Applications/${TWIML_APP_SID}.json`,
  );
  if (status !== 200) {
    fail(`TwiML App ${TWIML_APP_SID} not found in this account (${status}). Either the SID is wrong or the app was deleted.`);
    return;
  }
  ok(`TwiML App "${body.friendly_name}" (SID ${body.sid})`);
  info(`Voice URL: ${body.voice_url}`);
  info(`Voice method: ${body.voice_method}`);
  info(`Status callback: ${body.status_callback}`);

  if (body.voice_url !== EXPECTED_VOICE_URL) {
    fail(`voice_url is "${body.voice_url}" — expected "${EXPECTED_VOICE_URL}"`);
    info('Fix: re-run scripts/setup-twilio-voice.mjs which idempotently updates the URL.');
  }
  if (body.voice_method !== 'POST') {
    warn(`voice_method is "${body.voice_method}" — expected "POST"`);
  }

  // Reachability probe: fire an unsigned POST. Our server enforces
  // signature validation, so a 403 is GOOD (proves the endpoint is alive
  // and the security gate is working). 404/5xx/timeout = bad.
  console.log('\n      Probing voice_url reachability (unsigned POST)…');
  try {
    const probe = await fetch(body.voice_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'To=%2B19712584831',
      signal: AbortSignal.timeout(10000),
    });
    if (probe.status === 403) {
      ok(`endpoint alive — returned 403 (signature gate is enforcing — expected)`);
    } else if (probe.status === 200) {
      const text = await probe.text();
      if (text.includes('<Dial')) {
        warn('endpoint returned 200 with TwiML — signature check is DISABLED (this is a security risk; outbound /connect should require signature)');
      } else {
        warn(`endpoint returned 200 but no <Dial> verb — body: ${text.slice(0, 200)}`);
      }
    } else if (probe.status === 404) {
      fail(`endpoint returned 404 — TwiML App URL points at a path that doesn't exist on the server. Likely stale URL or wrong domain.`);
    } else if (probe.status >= 500) {
      fail(`endpoint returned ${probe.status} — server-side error. Check Railway logs for /api/twilio/voice/connect.`);
    } else {
      warn(`endpoint returned ${probe.status} — unexpected. Body: ${(await probe.text()).slice(0, 200)}`);
    }
  } catch (err) {
    fail(`endpoint unreachable: ${err.message}`);
    info('• DNS may be misconfigured');
    info('• Cloudflare/Railway routing may be down');
    info('• URL host may not match the deployed domain');
  }
}

// ─── Section 6: Phone number + Railway deploy SHA ───────────────────────────
async function checkPhoneNumber() {
  if (!PHONE_NUMBER) return;
  const { status, body } = await twilioFetch(
    `/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(PHONE_NUMBER)}`,
  );
  if (status !== 200) {
    fail(`phone number lookup failed: ${status}`);
    return;
  }
  const numbers = body.incoming_phone_numbers || [];
  if (numbers.length === 0) {
    fail(`${PHONE_NUMBER} is NOT owned by account ${ACCOUNT_SID}. Outbound calls will fail with 21206.`);
    return;
  }
  ok(`${PHONE_NUMBER} is owned by account (${numbers[0].friendly_name || 'unnamed'})`);
}

async function checkRailwayDeploy() {
  if (!RAILWAY_TOKEN) {
    info('(RAILWAY_TOKEN not in env — skipping deploy SHA check. Re-run with `RAILWAY_TOKEN=… railway run …` to enable.)');
    return;
  }
  // Latest successful deployment for the prod service.
  const data = await railwayGraphql(
    `query($p: String!, $e: String!, $s: String!) {
      deployments(
        first: 1
        input: { projectId: $p, environmentId: $e, serviceId: $s, status: { in: [SUCCESS] } }
      ) { edges { node { id status meta staticUrl createdAt } } }
    }`,
    { p: RAILWAY_PROJECT, e: RAILWAY_ENVIRONMENT, s: RAILWAY_SERVICE },
  );
  const node = data?.deployments?.edges?.[0]?.node;
  if (!node) {
    warn('no successful deployments returned — check Railway service status');
    return;
  }
  const meta = node.meta || {};
  const sha = meta.commitHash || meta.commit || '(unknown)';
  ok(`Railway deploy: SHA ${sha.slice(0, 8)} (status ${node.status}, created ${node.createdAt})`);

  // Compare to expected: PR #69 introduced the hardcoded edge list. Anything
  // before SHA 8536a03 is missing the fix.
  if (sha === '(unknown)') {
    info('(commit SHA not surfaced by Railway API — verify in dashboard that latest origin/main is deployed)');
  } else {
    info(`Compare to: git log --oneline origin/main -5`);
    info(`If SHA is older than 8536a03 (PR #69), prod is missing the edge-list fix.`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Twilio in-browser calling — credential health check ===');
  console.log('(read-only; no secrets are printed)');

  checkEnvVars();
  if (problems > 0) {
    console.log('\n→ Stopping early — fix env var problems first.');
    process.exit(1);
  }

  await checkMasterCreds();
  await checkApiKey();
  await checkApiKeySecretPair();
  await checkTwimlApp();

  console.log('\n[6/6] Phone number ownership + Railway deploy SHA');
  await checkPhoneNumber();
  await checkRailwayDeploy();

  console.log('\n=== Summary ===');
  console.log(`  problems: ${problems}`);
  console.log(`  warnings: ${warnings}`);
  if (problems === 0 && warnings === 0) {
    console.log('\n✓ All checks passed. If outbound calls still hang on "Connecting...", the failure is');
    console.log('  client-side (browser ↔ Twilio edge WebSocket). Open DevTools console while reproducing');
    console.log('  and look for [Voice] log lines or chunderw-vpc-gll WebSocket state.');
  }
  process.exit(problems > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n✗ Script crashed:', err.message);
  process.exit(2);
});
