# Financial Blindspot

Most financial apps show you what you have. Financial Blindspot helps you see what is missing.

**Financial education, not regulated financial advice.** This prototype does not recommend products, providers, securities, allocations or actions with money. Its illustrative thresholds are not universal financial standards or a legal compliance certification.

## Status

Local implementation includes the deterministic engine, quick/full interview orchestration, durable storage, outbound safety gate, Mastra Telegram wiring, protected Galtea routes and a read-only dashboard. Offline tests, typechecking and a production build are available.

**Nebius smoke checks and the initial Telegram welcome response have been verified; full interview/revisit phone tests, Railway deployment and Galtea before/after evaluation remain incomplete.** `/evidence` remains pending and claims no Galtea score. Track genuine progress in `openspec/changes/init-blindspot-agent/tasks.md`.

The live smoke corpus includes every interview question, representative acknowledgements, and prohibited advice/credential requests. It caught a classifier false positive on permitted country/income questions: the policy now distinguishes coarse assessment data from prohibited identifiers, without bypassing the independent classifier. These smoke checks are not a substitute for Galtea or proof of perfect safety.

Known unfinished behavior: post-report educational follow-up Q&A still needs implementation; production-mode Railway dependency installation still needs verification. Use fictional data and explicit currency/period units while testing. The six-month follow-up is a labelled simulation, not an automatic scheduler.

## macOS local installation and testing

Follow these steps in order. Railway, Galtea and Make accounts are **not needed** for the first local Telegram test. You need a Mac, Telegram, a Nebius API key with available credits, and an internet connection.

This guide uses **port 4112** and the tested **Node 22.23.2 / npm 11.19.1** toolchain. The code requires Node 22.23.2 or newer. npm 10.9.2 hit a dependency-resolver crash during setup, so the commands below explicitly select the tested versions without replacing your global installation. Apple Silicon was tested; Intel Homebrew paths are included but were not separately tested.

Use three terminal tabs:

| Terminal | Purpose | Leave running? |
| --- | --- | --- |
| A | Install/configure, then run the app | Yes, once the app starts |
| B | Cloudflare Tunnel | Yes |
| C | Register the webhook and run checks | Only while commands execute |

### Step 1 — Install Homebrew

Open **Terminal**. If `brew --version` works, skip the installer.

On a fresh Mac, install Apple's Command Line Tools if necessary:

```sh
xcode-select --install
```

Finish the macOS installation dialog before continuing. If the tools are already installed, continue without reinstalling them.

The official installer is documented at [brew.sh](https://brew.sh/). Review its prompts and run it yourself in Terminal:

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the installer's **Next steps** to make Homebrew available in new terminal tabs. To enable it in the current tab, use the command for your Mac:

Apple Silicon:

```sh
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Intel:

```sh
eval "$(/usr/local/bin/brew shellenv)"
```

Verify:

```sh
brew --version
```

### Step 2 — Install the local tools

In Terminal A:

```sh
brew install node@22 cloudflared git
export PATH="$(brew --prefix node@22)/bin:$PATH"
node --version
npm --version
cloudflared --version
```

`node@22` is keg-only, so the `PATH` line selects it for this terminal. Repeat that line in another tab if `node` or `npm` is unavailable there. Follow Homebrew's shell setup from Step 1 if `brew` itself is unavailable.

Define this helper in Terminal A:

```sh
function appnpm() {
  npm exec --yes --package=node@22.23.2 --package=npm@11.19.1 -- npm "$@"
}
```

The remaining `appnpm` commands run with the tested versions. This helper exists only in this terminal; Terminal C uses the full equivalent command later.

Homebrew's cleanup output is normal. Unrelated tap-trust or outdated-package warnings do not mean cloudflared failed to install. Do not trust whole third-party taps or upgrade unrelated packages just to follow this guide. You do not need `brew services start cloudflared` or a Cloudflare account for the temporary tunnel below.

### Step 3 — Get the code

For a fresh checkout, choose a parent folder and clone the implementation branch:

```sh
cd ~/Documents
git clone --branch feat/financial-blindspot --single-branch https://github.com/Nicolas-Cardenas-Segura/finblindspot.git
cd finblindspot
```

If you already have this branch checked out, use that existing folder instead; do not clone over it or discard local changes.

```sh
git branch --show-current
```

Expected branch: `feat/financial-blindspot`. Run subsequent project commands from the folder containing `package.json`.

### Step 4 — Install dependencies and run offline checks

```sh
appnpm ci --include=dev
appnpm run typecheck
appnpm test
```

These checks do not call Nebius or Telegram. Development dependencies are needed for testing, building, and the current `prestart` script. Do not bypass dependency security checks or approve install scripts indiscriminately if installation reports a problem.

### Step 5 — Create your private environment file

```sh
cp -n .env.example .env
open -e .env
```

`cp -n` does not overwrite an existing `.env`. TextEdit opens the file; keep it as plain text and save with **Cmd + S**.

Set:

```dotenv
NODE_ENV=development
PORT=4112
PUBLIC_BASE_URL=http://localhost:4112
DATABASE_URL=file:./data/mastra.db
APP_DATABASE_URL=file:./data/blindspot.db
```

Keep the other defaults. Leave token fields blank until the relevant steps below. `.env.example` contains blank credential fields and is committed; **the real `.env` is local-only and must never be committed or pushed**.

Check without displaying any secrets:

```sh
git check-ignore -v .env
git ls-files -- .env
```

The first command should identify the ignore rule. The second should print nothing. Never use `git add -f` on `.env`. Database files, generated builds and local data are also ignored. Do not copy private reports or the external build brief into the repository.

### Step 6 — Configure and test Nebius

Obtain your key from your [Nebius project API keys](https://tokenfactory.nebius.com/project/api-keys). In the editor, paste it directly after `NEBIUS_API_KEY=` and save. Do not put keys in shell command arguments, screenshots, Git, or chat.

Before configuring Telegram, check the model connection:

```sh
appnpm run verify:models
```

This command consumes a small amount of Nebius credits. It checks model availability, synthetic structured extraction, permitted interview questions and prohibited advice/credential requests. Expect check records with `"passed":true` and a successful exit. A BLOCK decision is correct for a must-block case; `passed` is the overall expectation check. An UNAVAILABLE result is not a successful block. If a case fails, investigate before continuing; do not disable the guardrail.

### Step 7 — Create a Telegram bot

In Telegram:

1. Open the official **@BotFather**.
2. Send `/newbot`.
3. Choose a display name.
4. Choose an available username ending in `bot`.
5. Copy the token BotFather returns into `TELEGRAM_BOT_TOKEN=` in `.env`.
6. Set `TELEGRAM_BOT_USERNAME=` to the username **without `@`**, not the display name.

Use a dedicated development bot if teammates have other environments running. **Each bot has one webhook destination**: registering a laptop tunnel for a shared bot redirects delivery away from its previous deployment. This does not mean each end user needs a separate bot; many private users can share one deployed bot.

### Step 8 — Generate the webhook secret

Run:

```sh
openssl rand -hex 32 | pbcopy
```

This copies a new random secret to the macOS clipboard without displaying it. Paste it after `TELEGRAM_WEBHOOK_SECRET_TOKEN=` in `.env` and save. This secret is separate from the BotFather token.

`EVAL_API_TOKEN` and `GALTEA_API_KEY` can remain blank for the first Telegram test. When setting up evaluation, run the generation command again for a separate `EVAL_API_TOKEN`. The Galtea account API key is a different credential obtained from Galtea, not a generated endpoint secret.

### Step 9 — Start the HTTPS tunnel in Terminal B

Open a new terminal tab with **Cmd + T** and run:

```sh
cloudflared tunnel --url http://localhost:4112
```

Leave this terminal running. Copy the actual HTTPS address ending in `trycloudflare.com` that it prints. In your `.env` editor, replace `PUBLIC_BASE_URL` with that address, without adding a path or changing `PORT=4112`, then save.

The missing `config.yml` message is normal for a quick tunnel. A connection-refused/502 error is expected before the app starts, or briefly while it restarts. These tunnels have no uptime guarantee and are for local development only, not judging.

### Step 10 — Build and start the app in Terminal A

After saving the tunnel address:

```sh
appnpm run build
appnpm start
```

Leave Terminal A running too. The lack of a returning command prompt is normal. `npm start` explicitly preloads `dotenv/config` because the built Mastra server does not retain the source's dotenv import; the separate `prestart` process alone cannot set the server's environment.

Open `http://localhost:4112` to view the dashboard. Open `http://localhost:4112/ready`; it should return `{"ready":true}`. Also open your actual tunnel address with `/ready` appended. Readiness initialises storage and the retention loop; it does not itself prove that a model can answer.

If an app is already running on 4112, do not start a second copy. Stop only that app process before restarting it, or deliberately choose another port and update the tunnel target too. Do not stop unrelated Node processes.

### Step 11 — Register the webhook from Terminal C

Open another tab and go to the same project folder used in Terminal A. Make Homebrew available as in Step 1 if necessary, then run:

```sh
export PATH="$(brew --prefix node@22)/bin:$PATH"
npm exec --yes --package=node@22.23.2 --package=npm@11.19.1 -- npm run register:webhook -- --confirm
```

**This changes your bot's live webhook destination.** Run it only after confirming that `.env` points to the intended tunnel and that no teammate or production deployment needs the current destination. Registration does not drop pending updates. Expected output: `Telegram webhook registered successfully.`

Verify public access controls:

```sh
npm exec --yes --package=node@22.23.2 --package=npm@11.19.1 -- npm run verify:access
```

Expected: ready/health and dashboard assets are accessible; raw framework APIs, unauthenticated evaluation requests and unauthorised report access are denied. With a configured bot, the webhook should return **401** without its secret, not 404.

### Step 12 — Test the conversation with fictional data

Open your bot's private Telegram chat. Send one message at a time and wait for each response:

1. `/start` — expect the education-only welcome and path choices.
2. `/quick` — expect the country/currency question.
3. Continue with these fictional answers, only when the matching question is asked:

| Question | Reply |
| --- | --- |
| Residence and assessment currency | `Spain, EUR` |
| Monthly take-home income | `4000 EUR per month` |
| Essential monthly expenditure | `2000 EUR per month` |
| Accessible cash savings | `5400 EUR` |
| Monthly debt payments | `0 EUR per month` |

Expected arithmetic: runway **2.7 months, red**; debt exposure **0%, green**. Retirement visibility, concentration and cross-border complexity remain not assessed on this partial path. These are acceptance expectations, not a claim that the entire live flow has already passed.

Open the report link the bot returns. It is a bearer link: anyone with it can read that report until expiry, so do not publish it in screenshots or issues. Use explicit currencies while the known bare-number inference issue remains open.

Then test `/report`, `/revisit`, `/full`, corrections via `/edit income`, and a harmless off-topic message. Ask a second Telegram account to send `/start` and verify it begins its own assessment without seeing the first user's data. Requesting a named investment recommendation must not produce investment instructions.

To check persistence, wait for the current reply to finish, stop only the app in Terminal A with **Ctrl + C**, restart with `appnpm start`, and send `/resume`. Leave the tunnel running. Saved progress and baseline snapshots should survive; interrupted model calls are not automatically replayed.

To deliberately remove your own test data, use `/forget` and then `/confirmforget`. This deletes application records and revokes report links; it does not delete Telegram's chat history.

### Keeping the local test running

- Keep the Mac awake and both the app and tunnel processes running. Closing a terminal tab, sleeping the Mac or losing internet can interrupt replies.
- Changing `.env` requires restarting the app; no terminal or Mac restart is needed merely because cloudflared was installed.
- Restarting only the app does not require re-registering an unchanged webhook.
- Restarting a quick tunnel usually changes its URL. Update `PUBLIC_BASE_URL`, restart the app, then explicitly register the new destination again.
- If readiness works but Telegram is silent, inspect the app's terminal and run the model/access checks. A classifier failure intentionally withholds a reply; do not weaken the guardrail to hide it.
- Without credentials, the public dashboard can run, but no model/bot conversation is faked. Railway is the later stable deployment; Galtea is the later evaluation phase.

### Optional development mode

The steps above test the built application. For Mastra development mode, build the web assets with `npm run build:web`, then run `npm run dev`. For separate frontend hot reload, `npm run dev:web` currently proxies `/api` to port **4111**; align that proxy with your app port before using it with this guide's 4112 configuration. A local polling process must never silently remove the webhook of a shared bot.

## Configuration

| Variable | Purpose |
| --- | --- |
| `NEBIUS_API_KEY` | Model access; required before live inference |
| `NEBIUS_INTERVIEW_MODEL` | Configurable provisional extraction/explanation model |
| `NEBIUS_CLASSIFIER_MODEL` | Configurable provisional independent guardrail model |
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `TELEGRAM_BOT_USERNAME` | Bot handle, without `@` |
| `TELEGRAM_WEBHOOK_SECRET_TOKEN` | Independent random 32+ character webhook secret, letters/digits/underscore/hyphen |
| `PUBLIC_BASE_URL` | Stable public HTTPS origin in production |
| `DATABASE_URL` | Mastra LibSQL file URL |
| `APP_DATABASE_URL` | Application LibSQL file URL |
| `EVAL_API_TOKEN` | Independent random 32+ character bearer secret for incoming evaluation requests |
| `GALTEA_API_KEY` | Galtea account tooling only; not the incoming endpoint token |
| `RETENTION_DAYS` | Fixed retention from assessment creation, default 7, maximum 30 |
| `REPORT_TTL_HOURS` | Report bearer-link lifetime, default 24, capped by assessment expiry |

The default model IDs are candidates from the planning research, not measured quality guarantees. Run `npm run verify:models` after securely configuring credentials. It uses synthetic examples and consumes model credits. It checks catalogue membership, structured extraction and guardrail fixtures; it does not replace Galtea, prove determinism or prove Mastra's whole live turn path. Some block cases are rejected by the deterministic prefilter before reaching the classifier.

## Telegram

The registered Mastra agent ID is `financial-blindspot`. Its webhook is:

```text
/api/agents/financial-blindspot/channels/telegram/webhook
```

Framework APIs use the protected `/internal` prefix, but the installed Mastra Channels version generates its webhook under `/api/agents/` independently of that prefix. The webhook requires its own secret. A regression test checks the registration path against the framework-generated route. After approving the live destination, register it explicitly:

```sh
npm run register:webhook -- --confirm
```

Registration preserves pending updates. Do not use the same bot with a local polling process. The adapter verifies the webhook secret; raw framework/memory APIs require authentication and are not made public.

The chat introduces itself as **MyFinGap**, an AI financial education assistant; existing internal IDs and the configured Telegram handle are unchanged. The guided conversation uses gentle question transitions and factual acknowledgements instead of technical `Recorded ...` messages. Common replies such as “a quick check, please”, “a more detailed look”, “continue”, “show my report”, “update my figures” and “skip” are supported. Path-choice phrases are interpreted when choosing a path or after completion, not in the middle of a financial answer. This is still a guided assessment, not unrestricted financial-adviser chat.

“Start fresh” requests deletion confirmation; it does not delete anything immediately. A casual “yes” never substitutes for the explicit `/confirmforget` deletion command. Slash-command shortcuts remain available: `/start`, `/quick`, `/full`, `/resume`, `/skip`, `/report`, `/edit income` (or another domain), `/revisit`, `/simulate6months`, `/forget`, `/confirmforget`, `/cancel`, `/help`.

Validated partial country/currency and simple money answers are retained separately from the scored profile. For example, “Spain, dollars and euros” keeps Spain and asks which currency should label the report; it does not assume that all holdings share that currency or convert them. “4000” can be retained while the bot asks for its currency, and “US dollars” can complete that answer. Country information in an opening message is retained across the path choice. Explicit unknown/skip answers are different from an incomplete answer. Drafts survive restart, share assessment retention/deletion, and do not become scored facts until complete. `npm run verify:clarification` exercises these scenarios with synthetic sessions and model calls, then cleans up only those test sessions.

The quick path assesses country/base currency, income, essential expenditure, cash and debt payments. Other cards remain **not assessed**. The full path adds age, previous countries, pensions, investments, property, dependants, protection, goals, retirement age and confidence. Clarifications can add turns. Corrections to previously recorded fields require confirmation.

The six-month command is a labelled simulation, not a scheduler. It preserves actual timestamps. Saved memory and resumable state are the real beyond-wrapper behaviours.

## How the boundary works

1. The prompt defines the educational role and the welcome message explains it.
2. Profile patches are validated, with explicit ranges, currencies, periods and missing states. No exchange rates or midpoints are invented.
3. `src/core/` computes every indicator, colour, ranking and comparison without a model, framework or database dependency.
4. Report explanations use model-selected, validated definition/uncertainty phrase IDs. Code renders the approved phrase catalogue; the report path cannot inject arbitrary new numbers or pension-law claims.
5. Every final bot message is independently classified before delivery. The prefilter can reject but never approve on its own. Blocked wording can be regenerated once; fallbacks also require classification. Invalid, truncated, unavailable or timed-out classification withholds output. Typing/draft streaming, tool cards and raw error responses do not bypass the gate.
6. Telegram and Galtea use the same turn service. A response rejected by the gate cannot become a saved public-facing report.

Missing credentials deliberately prevent replies. An outage can cause silence; it is not converted into unclassified output. These controls are a tested design, not a claim of perfect model safety.

## Financial semantics

Runway is accessible cash / essential monthly expenditure. Debt exposure is monthly debt payments / take-home income. Annual flows are normalised in code. Missing or zero denominators do not become infinity or green. Mixed currencies require user-provided approximate comparable values. Intervals crossing colour bands remain uncertain.

Retirement visibility counts missing applicable information; it does not measure funding adequacy. Concentration aggregates broad reported asset classes, including cash, property and known pensions; incomplete totals are not scored. Cross-border complexity counts reported jurisdictions/currencies and unverified foreign pensions, not tax liability.

Approved illustrative bands are centralised in `src/core/thresholds.ts`:

| Indicator | Green | Amber | Red |
| --- | --- | --- | --- |
| Runway | >=6 months | 3 to <6 | <3 |
| Debt exposure | <20% | 20 to <40% | >=40% |
| Largest asset class | <60% | 60 to <80% | >=80% |
| Missing pension fields | 0 | 1 | >=2 |
| Cross-border complexity points | 0 | 1–2 | >=3 |

Reports rank up to three genuine flags or clearly labelled information gaps. Unknown is not zero; no declared pensions is not a green retirement-adequacy claim. Baselines are immutable and comparisons exclude incompatible currencies/rules or uncertain ranges.

## Privacy and storage

Only private Telegram chats support assessment. The verified webhook wrapper strips names, forwarded/replied content and attachments and replaces obvious sensitive text before the Telegram SDK parses or caches it. Unsupported documents and obvious credentials/identifiers are rejected before model calls or application history. Pattern detection is not a guarantee that every possible sensitive string will be recognised; users must not submit identifying data.

Mastra memory is read-only during generation. Only canonical validated summaries and approved replies are explicitly persisted afterward. No raw model input, generated draft, tool output or report token is stored in conversation memory. The private channel state adapter discards the SDK's `msg-history:` cache entries; setting `maxMessages: 0` is insufficient in the pinned SDK.

Application records and Mastra conversation memory are separate. Owner identities are server-derived; evaluation identities cannot access Telegram state. Report links are random bearer capabilities, stored hashed and scoped to one snapshot. **Anyone possessing a link can read that report until expiry or deletion.** Private responses use no-store/no-referrer headers and no third-party assets or analytics. Keep hosting/proxy access logs from recording report-token paths.

`/forget` followed by `/confirmforget` removes the user's application data, report capabilities and sanitised Mastra thread. Confirmed deletion still executes during a model outage, though the acknowledgement is withheld if it cannot be classified. It does not delete Telegram's independent history or copies already made by a link recipient. Expiry denies further access and the runtime cleanup removes expired records. Do not enable raw prompt tracing in production.

## Railway deployment

This deployment is not yet verified. Before deploying with `NODE_ENV=production`, ensure the build installation includes the development dependencies needed by Vite/Mastra and retains the current `prestart` tooling; the checked-in `npm ci` build command still needs that production-mode validation. Do not treat these settings as a completed deployment test.

Use one persistent Node service and one volume mounted at `/data`. Set:

```text
NODE_ENV=production
DATABASE_URL=file:/data/mastra.db
APP_DATABASE_URL=file:/data/blindspot.db
```

Set `PUBLIC_BASE_URL` to the assigned stable HTTPS origin and configure the other secrets in Railway. `railway.json` supplies build/start/health commands. Keep Node aligned with `.node-version`; retain dependencies needed by `prestart`. Directories are prepared at start, not during the build, when the volume is unavailable. Do not configure a serverless ephemeral file database.

Volume-backed services have a brief interruption on deploy and cannot use replicas. Keep the service awake through remote judging; do not claim zero-downtime/high availability. Verify an in-progress interview and saved baseline survive a restart. In-flight model calls are not automatically replayed; users can resume or retry.

## Galtea

Use HTTPS Endpoint Connections in the Galtea dashboard; the running app needs no Python service. Galtea documents `{{ galtea_session_id }}` as its own session identifier, distinct from an external `{{ session_id }}` supplied by the product. See [template syntax](https://docs.galtea.ai/concepts/product/endpoint-connection-template-syntax) and the [dashboard workflow](https://docs.galtea.ai/sdk/tutorials/direct-inferences-and-evaluations-from-platform).

### Recommended: one Conversation connection

This avoids the onboarding wizard's requirement to test the conversation before creating its optional initialization connection.

- URL: your current public HTTPS origin plus `/api/eval/message`.
- Method: `POST`.
- Authentication: Bearer, with the value of `EVAL_API_TOKEN` only.
- Input Template (replace the whole default OpenAI example):

```json
{
  "galtea_session_id": "{{ galtea_session_id }}",
  "message": "{{ input.user_message }}"
}
```

- Output Mapping: `{"output":"$.response"}`.
- Headers: `Content-Type: application/json` and the form's `Authorization: Bearer {{ bearer_token }}`.
- Timeout: 60 seconds. Initial rate limit: 15 requests/minute. Keep automatic retries disabled during connection setup.
- Uncheck **Initialization** and **Finalization** for the initial single-connection setup, then use **Test Connection** before creating the connection.

The first authenticated message for a native Galtea ID atomically creates a random internal `eval:` session. Later turns with that same native ID resume it, including after an app restart. Different native IDs never share a fallback session. The identifier is stored hashed, and cannot directly select a Telegram user or an existing UUID-based evaluation session. Empty IDs, unrendered placeholders and requests supplying both ID types are rejected. Never replace the template variable with a shared constant; Galtea supplies the per-conversation value.

The response contains `response` and the internal `session_id`; only `response` needs an output mapping in native-ID mode. The app uses the `X-Galtea-Inference-Id` header for turn deduplication when available. You may additionally supply `"turn_id":"{{ trace_id }}"` once its population has been verified in the platform.

Sessions still expire under the configured retention policy. For larger evaluations, add an optional Finalization connection to `POST /api/eval/finalize`, with the same bearer secret and body `{"galtea_session_id":"{{ galtea_session_id }}"}`. It deletes the test session, its memory and the native-ID mapping. A later message reusing a finalized native ID starts a fresh internal session, not the deleted conversation. There is a shared cap of 500 active evaluation sessions, so use finalization before large/repeated runs.

To smoke-test the native and explicit contracts against the configured live HTTPS endpoint, run `npm run verify:eval` (or the pinned `appnpm` equivalent). It consumes model credits, uses synthetic data only, verifies authentication/isolation/resumption plus privacy confirmation, cancellation and fresh-start behavior, and cleans up only the test sessions it creates. It does not register a Telegram webhook, send Telegram messages, or count as a Galtea platform evaluation.

### Existing explicit initialization API

The original three-step contract remains supported for clients that can initialize before sending messages:

- Initialization: `POST /api/eval/init`, bearer `EVAL_API_TOKEN`; extract the returned UUID `session_id` from `$.session_id`.
- Conversation: `POST /api/eval/message`, same bearer, with `{"session_id":"{{ session_id }}","message":"{{ input.user_message }}"}`.
- Output Mapping: `{"output":"$.response"}`.
- Finalization: `POST /api/eval/finalize` with `{"session_id":"{{ session_id }}"}`.

Do not mix the two ID fields in one request. An arbitrary placeholder such as `thread_abc123` is not a valid initialized UUID; the explicit contract continues to reject it.

Use synthetic profiles. `evals/fixtures.json` contains initial defensive cases, not fabricated results. Each Security dataset covers one threat. Include advice attacks, factual/missing-data failures and benign task completion. Capture the first functioning baseline, fix real failures, and rerun frozen cases with fresh sessions and unchanged evaluator settings. Record commit/model/rules/prompt/evaluator versions, case counts, actual failures and infrastructure errors. Replace the pending evidence state only with sanitised genuine exports.

The Galtea feedback survey is required for its challenge: https://tally.so/r/J9Pyar.

## Verification and sponsor map

```sh
npm test
npm run typecheck
npm run build
npm run verify:access
openspec validate init-blindspot-agent --strict
```

`verify:access` expects the server at `PUBLIC_BASE_URL`; it checks health, denied unauthenticated framework/eval access and invalid report links. A missing Telegram route can pass this offline probe but does not prove a configured live webhook. Automated tests use synthetic temporary storage and deterministic protocol inputs, not sponsor API calls or model-output snapshots. Model behaviour remains a live Galtea and phone-test gate.

- **Mastra:** agent runtime, Telegram Channels, sanitised persistent conversation memory and typed tool definitions. The application owns interview progression and commits; extraction does not get arbitrary mutation tools.
- **Nebius:** structured extraction, constrained explanation selection and an independent outbound classifier.
- **Galtea:** authenticated Endpoint Connection evaluation of the real pipeline; actual runs pending.
- **Norma:** optional scan/fix/rescan after the core is verified. **Make:** deferred.

For HackBarna, plan to the earlier conflicting deadline, Sunday **20 September 2026 at 11:00 Europe/Madrid**, and keep the bot live through **17:30**. Obtain the real submission form from organisers; the retrieved event page still had a placeholder. Publishing the repo/video, submitting forms and changing the live webhook require explicit approval.

## License

MIT; see `LICENSE`.
