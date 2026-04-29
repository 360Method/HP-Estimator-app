/**
 * setup-twilio-voice.mjs
 *
 * One-shot setup for Twilio in-browser calling. Creates (or reuses) the
 * Standard API Key and the TwiML App in the Twilio Console, then sets the
 * three resulting env vars on the Railway prod service so the Voice SDK can
 * sign access tokens.
 *
 * Run from local with prod env injected:
 *   RAILWAY_TOKEN=<token> railway run \
 *     --service 25bceb51-6161-4bd4-a9ea-1ed0d6381b09 \
 *     -- node scripts/setup-twilio-voice.mjs
 *
 * Reads from process.env (provided by `railway run`):
 *   TWILIO_ACCOUNT_SID   — already set
 *   TWILIO_AUTH_TOKEN    — already set
 *   RAILWAY_TOKEN        — passed in to write back the new vars
 *
 * Prints only what's necessary (resource SIDs + success markers); never the
 * API secret or the auth token.
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;

const RAILWAY_PROJECT = 'd3a9ee5b-ac78-4914-8210-45b1417297f4';
const RAILWAY_ENVIRONMENT = '0e57bbed-d422-42c5-9661-c1c931800379';
const RAILWAY_SERVICE = '25bceb51-6161-4bd4-a9ea-1ed0d6381b09'; // HP-Estimator-app prod

const VOICE_CONNECT_URL = 'https://pro.handypioneers.com/api/twilio/voice/connect';
const VOICE_STATUS_URL = 'https://pro.handypioneers.com/api/twilio/voice/status';
const API_KEY_NAME = 'HP Voice SDK';
const TWIML_APP_NAME = 'HP In-Browser Calling';

function bail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!ACCOUNT_SID) bail('TWILIO_ACCOUNT_SID missing — run via `railway run`.');
if (!AUTH_TOKEN) bail('TWILIO_AUTH_TOKEN missing — run via `railway run`.');
if (!RAILWAY_TOKEN) bail('RAILWAY_TOKEN missing — pass it inline.');

const twilioAuth = 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

async function twilioGet(path) {
  const r = await fetch(`https://api.twilio.com${path}`, { headers: { Authorization: twilioAuth } });
  if (!r.ok) throw new Error(`Twilio GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function twilioPost(path, params) {
  const body = new URLSearchParams(params).toString();
  const r = await fetch(`https://api.twilio.com${path}`, {
    method: 'POST',
    headers: { Authorization: twilioAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`Twilio POST ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function twilioPostUpdate(path, params) {
  return twilioPost(path, params);
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

async function findOrCreateApiKey() {
  // List existing keys (paginated; first page is plenty — we only check by name)
  const list = await twilioGet(`/2010-04-01/Accounts/${ACCOUNT_SID}/Keys.json?PageSize=100`);
  const existing = (list.keys || []).find(k => k.friendly_name === API_KEY_NAME);
  if (existing) {
    console.log(`✓ API Key "${API_KEY_NAME}" already exists: ${existing.sid}`);
    console.log(`  ⚠ Secret is only shown at creation time — Twilio cannot return it later.`);
    console.log(`    If TWILIO_API_SECRET on Railway is wrong, delete this key in the Console`);
    console.log(`    (or via the API) and re-run this script to mint a fresh one.`);
    return { sid: existing.sid, secret: null };
  }
  // Create new
  const created = await twilioPost(`/2010-04-01/Accounts/${ACCOUNT_SID}/Keys.json`, {
    FriendlyName: API_KEY_NAME,
  });
  console.log(`✓ API Key created: ${created.sid}`);
  return { sid: created.sid, secret: created.secret };
}

async function findOrCreateTwimlApp() {
  const list = await twilioGet(`/2010-04-01/Accounts/${ACCOUNT_SID}/Applications.json?PageSize=100`);
  const existing = (list.applications || []).find(a => a.friendly_name === TWIML_APP_NAME);
  if (existing) {
    // Make sure the URLs are pointing where we expect — update if not.
    const needsUpdate =
      existing.voice_url !== VOICE_CONNECT_URL ||
      existing.voice_method !== 'POST' ||
      existing.status_callback !== VOICE_STATUS_URL;
    if (needsUpdate) {
      await twilioPostUpdate(
        `/2010-04-01/Accounts/${ACCOUNT_SID}/Applications/${existing.sid}.json`,
        {
          VoiceUrl: VOICE_CONNECT_URL,
          VoiceMethod: 'POST',
          StatusCallback: VOICE_STATUS_URL,
          StatusCallbackMethod: 'POST',
        },
      );
      console.log(`✓ TwiML App "${TWIML_APP_NAME}" updated: ${existing.sid}`);
    } else {
      console.log(`✓ TwiML App "${TWIML_APP_NAME}" already correct: ${existing.sid}`);
    }
    return existing.sid;
  }
  const created = await twilioPost(`/2010-04-01/Accounts/${ACCOUNT_SID}/Applications.json`, {
    FriendlyName: TWIML_APP_NAME,
    VoiceUrl: VOICE_CONNECT_URL,
    VoiceMethod: 'POST',
    StatusCallback: VOICE_STATUS_URL,
    StatusCallbackMethod: 'POST',
  });
  console.log(`✓ TwiML App created: ${created.sid}`);
  return created.sid;
}

async function setRailwayVar(name, value) {
  // Railway GraphQL: variableUpsert
  const mutation = `
    mutation($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }
  `;
  await railwayGraphql(mutation, {
    input: {
      projectId: RAILWAY_PROJECT,
      environmentId: RAILWAY_ENVIRONMENT,
      serviceId: RAILWAY_SERVICE,
      name,
      value,
    },
  });
  console.log(`✓ Railway env var set: ${name}`);
}

async function triggerRedeploy() {
  // Find the most recent deploy and redeploy from it.
  const data = await railwayGraphql(
    `query { deployments(first: 1, input: { projectId: "${RAILWAY_PROJECT}", environmentId: "${RAILWAY_ENVIRONMENT}", serviceId: "${RAILWAY_SERVICE}" }) { edges { node { id status } } } }`,
  );
  const deploymentId = data?.deployments?.edges?.[0]?.node?.id;
  if (!deploymentId) {
    console.warn('⚠ Could not find a deployment to redeploy. Trigger a redeploy manually in the Railway dashboard.');
    return;
  }
  await railwayGraphql(
    `mutation($id: String!) { deploymentRedeploy(id: $id) { id status } }`,
    { id: deploymentId },
  );
  console.log(`✓ Redeploy triggered for deployment ${deploymentId}`);
}

async function main() {
  console.log('--- Twilio in-browser calling setup ---');

  const { sid: apiKeySid, secret: apiKeySecret } = await findOrCreateApiKey();
  const twimlAppSid = await findOrCreateTwimlApp();

  // Always overwrite TWILIO_API_KEY + TWILIO_TWIML_APP_SID. Only set
  // TWILIO_API_SECRET if we just minted a fresh key (the secret is only
  // returned at creation time).
  await setRailwayVar('TWILIO_API_KEY', apiKeySid);
  await setRailwayVar('TWILIO_TWIML_APP_SID', twimlAppSid);
  if (apiKeySecret) {
    await setRailwayVar('TWILIO_API_SECRET', apiKeySecret);
  } else {
    console.log('  (TWILIO_API_SECRET left untouched — existing key was reused.)');
  }

  await triggerRedeploy();

  console.log('\n✓ Done. Wait ~60–120s for the redeploy, then click Call on a customer profile.');
}

main().catch(err => {
  console.error('✗ Setup failed:', err.message);
  process.exit(1);
});
