# RIME_EVIDENCE.md

> **Overall claim status: NOT CONFIRMED.** Graceful-degradation behavior (no key /
> failed call -> browser fallback) is well-supported by static code review. The core
> claim under test — that a valid key produces real synthesized audio from Rime — is
> **untested**. Everything in this document should be read with that gap in mind.

> **Reviewer note:** This evidence was compiled via static code review only, without
> execution access — `npm install` failed (registry blocked, `403` on
> `registry.npmjs.org`) and outbound network access to `rime.ai` was blocked by this
> sandbox's egress proxy (`x-deny-reason: host_not_allowed`). No independent party has
> run the runtime script below against a live Rime key; this is a self-review of the
> codebase, not an executed audit.

## The hard claim

The app (README/metadata/UI) advertises **real Rime TTS voice synthesis**, not just a
browser voice with a British accent:

- `metadata.json` / `index.html`: *"Real-time voice companion ... and Rime TTS."*
- `SettingsModal.tsx`: *"Rime Coda — Ultra-low latency conversational engine"*, "Rime TTS Ready"
- `ArchitectureModal.tsx` pipeline diagram: `Mic Input -> ... -> Gemini 3.8 Flash -> Rime TTS -> Web Audio Playback`

Underneath, `src/services/ttsService.ts` calls a server proxy at
`POST /api/companion/rime-tts` (implemented in `server.ts`), which in turn calls what
the code *presents* as the real Rime endpoint —
`https://users.rime.ai/v1/rime-tts` — with an `Authorization: Bearer $RIME_API_KEY`
header. (See Test D in Results: this domain has not been independently confirmed to
belong to Rime; the description here reflects what the code claims to do, not a
verified fact.) If `RIME_API_KEY` is unset, or the Rime call fails/errors, the
server returns `{ fallbackToClient: true, provider: 'browser_neural' }` and the client
falls back to the browser's built-in `SpeechSynthesis` API voice.

**So the claim actually being made is two-part:**
1. When a valid `RIME_API_KEY` is configured, speech is synthesized by the real Rime
   API (`modelId: coda|mist`, `speaker` from a fixed allow-list), not simulated.
2. When no key is configured (or Rime errors), the app **degrades gracefully** to a
   browser neural voice instead of breaking — it does not silently produce empty audio.

## Acceptance test

The claim is **accepted** if all of the following hold, and **rejected** otherwise:

| # | Condition | Pass criterion |
|---|-----------|-----------------|
| A | No `RIME_API_KEY` set | Server never attempts an outbound Rime call; responds `fallbackToClient: true, provider: "browser_neural"` |
| B | Invalid `RIME_API_KEY` / Rime returns non-2xx | Server catches the failure and still responds with the same fallback shape (no 500, no crash) |
| C | Valid `RIME_API_KEY` | Server returns `{ audio: <base64>, provider: "rime", speaker }` with non-empty audio bytes that decode to playable audio |
| D | Endpoint target | The outbound request goes to a real external host (`users.rime.ai`), not a local stub |
| E | `RIME_API_KEY` set to `""` or whitespace-only | Server treats this the same as unset (falls back), OR clearly documented if it instead attempts a call |

## Procedure

Two parts: **static verification** (done, see Result) and a **runtime script** you can
run in an environment with npm registry + outbound network access and your own
`RIME_API_KEY`.

### 1. Static verification (grep the contract)

Note: a bare `grep -n "users.rime.ai" server.ts` only proves the string exists
*somewhere* in the file — not that it's the literal argument passed to `fetch()`,
not dead code, not a comment, and not shadowed by a different variable at call
time. Tie the string to the call site instead, and paste the surrounding code
block into the evidence record rather than relying on line numbers alone:

```bash
grep -n "fetch(.*users.rime.ai" server.ts   # confirms the string is the fetch() argument, not just present in the file
grep -n -B2 -A10 "users.rime.ai" server.ts  # dump surrounding context for manual review
grep -n "RIME_API_KEY" server.ts .env.example
grep -n "fallbackToClient" server.ts src/services/ttsService.ts
```

### 2. Runtime script (repeatable, run in your own dev environment)

Note: this script now exercises all five acceptance conditions (A–E). Earlier
versions only covered A, C, and E — leaving B (invalid-key/non-2xx fallback) and D
(real external host) with no runtime check at all, even though the table lists them
as required. `set -e` is intentionally NOT used at top level, since a server crash
during one sub-test (e.g. under a malformed key) shouldn't abort the remaining tests;
each block checks its own exit status instead. A `trap` cleans up any server process
left running if the script exits early.

Save as `test-rime-evidence.sh` in the project root:

```bash
#!/usr/bin/env bash
# Deliberately no top-level `set -e`: a crash in one sub-test should not
# prevent the remaining sub-tests from running.

SERVER_PID=""
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; }
trap cleanup EXIT

start_server() {
  npm run dev &            # starts `tsx server.ts`
  SERVER_PID=$!
  # Poll for readiness instead of a blind sleep (max ~10s)
  for i in $(seq 1 20); do
    curl -s -o /dev/null http://localhost:3000/ && return 0
    sleep 0.5
  done
  echo "WARN: server did not respond to readiness poll in time"
}

DEFAULT_PAYLOAD='{"text":"evidence check","speaker":"albion","modelId":"coda"}'

call_endpoint() {
  # $1 = output file, $2 = optional JSON payload override (defaults to DEFAULT_PAYLOAD)
  local payload="${2:-$DEFAULT_PAYLOAD}"
  curl -s -w '\nHTTP_STATUS:%{http_code}\n' -X POST http://localhost:3000/api/companion/rime-tts \
    -H "Content-Type: application/json" \
    -d "$payload" \
    | tee "$1"
}

npm install || { echo "npm install failed - cannot run script"; exit 1; }

echo "== Test A: no RIME_API_KEY =="
unset RIME_API_KEY
start_server
call_endpoint /tmp/out_a.json
grep -q '"fallbackToClient":true' /tmp/out_a.json && echo "PASS A" || echo "FAIL A"
kill "$SERVER_PID" 2>/dev/null; SERVER_PID=""

echo "== Test B: invalid RIME_API_KEY (Rime should return non-2xx, server should still fall back, no 500) =="
RIME_API_KEY="invalid_key_deliberately_wrong" npm run dev &
SERVER_PID=$!
start_server
call_endpoint /tmp/out_b.json
STATUS_B=$(grep -o 'HTTP_STATUS:[0-9]*' /tmp/out_b.json | cut -d: -f2)
if grep -q '"fallbackToClient":true' /tmp/out_b.json && [ "$STATUS_B" != "500" ]; then
  echo "PASS B (fell back cleanly, HTTP $STATUS_B)"
else
  echo "FAIL B (HTTP $STATUS_B, response: $(cat /tmp/out_b.json))"
fi
kill "$SERVER_PID" 2>/dev/null; SERVER_PID=""

echo "== Test C: with valid RIME_API_KEY =="
RIME_API_KEY="$YOUR_REAL_KEY" npm run dev &
SERVER_PID=$!
start_server
call_endpoint /tmp/out_c.json
grep -q '"provider":"rime"' /tmp/out_c.json && echo "PASS C (provider field)" || echo "FAIL C (provider field)"
# Verify the returned audio actually decodes to a real audio container (WAV/RIFF,
# MP3 frame sync, or OGG magic bytes) rather than just checking byte-count:
python3 -c "
import json, base64
raw = open('/tmp/out_c.json').read().split('HTTP_STATUS:')[0]
d = json.loads(raw)
b = base64.b64decode(d['audio'])
print('decoded bytes:', len(b))
is_wav = b[:4] == b'RIFF' and b[8:12] == b'WAVE'
is_mp3 = b[:3] == b'ID3' or (len(b) > 1 and b[0] == 0xFF and (b[1] & 0xE0) == 0xE0)
is_ogg = b[:4] == b'OggS'
assert len(b) > 100, 'audio payload too small to be real'
assert is_wav or is_mp3 or is_ogg, 'audio bytes do not match any known container magic bytes -- may not be real audio'
print('container check:', 'WAV' if is_wav else 'MP3' if is_mp3 else 'OGG')
" && echo "PASS C (audio decodes to a real container)" || echo "FAIL C (audio decode/container check)"
kill "$SERVER_PID" 2>/dev/null; SERVER_PID=""

echo "== Test D: outbound request actually reaches users.rime.ai (not a local stub) =="
echo "Run this manually in an environment with a packet capture / proxy tool, e.g.:"
echo "  sudo tcpdump -i any host users.rime.ai -w /tmp/rime_traffic.pcap &"
echo "  (then re-run the Test C block above and inspect /tmp/rime_traffic.pcap)"
echo "This cannot be automated safely here since it requires elevated network capture permissions."

echo "== Test E: whitespace-only RIME_API_KEY =="
RIME_API_KEY="   " npm run dev &
SERVER_PID=$!
start_server
call_endpoint /tmp/out_e.json
if grep -q '"fallbackToClient":true' /tmp/out_e.json; then
  echo "PASS E (treated as unset)"
else
  echo "NOTE E: whitespace key was NOT treated as unset -- confirm this is intended before shipping"
fi
kill "$SERVER_PID" 2>/dev/null; SERVER_PID=""

echo "== Test (bonus): invalid speaker/model rejected server-side, not just client-side =="
start_server_for_bonus() { RIME_API_KEY="${YOUR_REAL_KEY:-}" npm run dev & SERVER_PID=$!; start_server; }
start_server_for_bonus
call_endpoint /tmp/out_bonus.json '{"text":"evidence check","speaker":"not_a_real_speaker","modelId":"coda"}'
STATUS_BONUS=$(grep -o 'HTTP_STATUS:[0-9]*' /tmp/out_bonus.json | cut -d: -f2)
if [ "$STATUS_BONUS" = "400" ] || grep -qi 'invalid.*speaker' /tmp/out_bonus.json; then
  echo "PASS (bonus): invalid speaker rejected server-side"
else
  echo "NOTE (bonus): invalid speaker was not clearly rejected server-side (HTTP $STATUS_BONUS) -- VALID_RIME_SPEAKERS may only be enforced client-side"
fi
kill "$SERVER_PID" 2>/dev/null; SERVER_PID=""
```

Run with `bash test-rime-evidence.sh` after exporting `YOUR_REAL_KEY` to a real Rime
API key. Test D still requires a manual packet-capture step, since confirming outbound
traffic actually leaves the box for `users.rime.ai` needs elevated capture permissions
this script shouldn't assume it has.

## Result (from this review)

- **Test C (the core claim: valid key -> real Rime audio) — UNVERIFIED. This is the
  blocking gap.** This is the actual hard claim under test ("real synthesis, not
  simulated"), and it has not been exercised at all. No `RIME_API_KEY` was available
  in this environment, and `npm install` also failed here (registry blocked: `403` on
  `registry.npmjs.org`), so the server could not even be started to run this path
  locally. Nothing below should be read as evidence that Rime synthesis actually
  works — only that the code is *structured* to call it.

- **Test A/B (no-key / failure fallback) — code-reviewed, consistent with pass
  criteria; not runtime-confirmed.** In `server.ts`, the Rime `fetch` call only
  happens inside `if (rimeApiKey) { ... }`; every exit path (missing key, non-OK
  response, thrown network error, outer catch) appears to fall through to the same
  `{ fallbackToClient: true, provider: 'browser_neural' }` response. This is a reading
  of the code, not an execution of it — it does not rule out an unhandled exception
  before the catch block, middleware intercepting the route, or an env-var name
  mismatch preventing this path from running as written. Reserve "PASS" for outcomes
  actually observed from running the script in the Procedure section.

- **Test D (real external host) — partially reviewed, not confirmed.** The code
  targets `https://users.rime.ai/v1/rime-tts` with a bearer-token header and a JSON
  body whose shape (`speaker`, `text`, `modelId`, `audioFormat`, `speedAlpha`)
  *resembles* Rime's documented TTS request format. This has not been cross-checked
  against Rime's actual API reference, and the domain itself was not independently
  confirmed to belong to Rime (no DNS/WHOIS/docs lookup was performed) — a
  plausible-looking but fabricated integration would look identical under this level
  of review. I attempted to confirm reachability directly by sending an
  unauthenticated request from this sandbox; it was blocked by the sandbox's own
  egress proxy (`x-deny-reason: host_not_allowed`) before reaching `rime.ai` at all, so
  **this run produced no live network evidence either way**. Confirming this
  definitively requires a packet capture during a live Test C run (see the Test D
  block in the runtime script, which documents the manual step — this can't be safely
  automated without elevated capture permissions).

- **Test E (empty/whitespace key) — not evaluated.** The `if (rimeApiKey)` truthiness
  check would correctly treat an empty string `""` as unset, but a whitespace-only
  value (e.g. `"   "`) is truthy in JavaScript and would *not* be caught by this
  check — meaning the server could attempt an outbound call with a malformed
  credential instead of falling back. This was not tested; see the runtime script's
  new Test E block.

- **Speaker/model allow-list — not cross-checked against Rime's real catalog.** The
  two advertised models (`coda`, `mist`) and the speaker set (`albion, victoria,
  astra, celeste, orion, lyra, masonry`) are validated in-code for shape only
  (`VALID_RIME_SPEAKERS` in `server.ts`). Whether these are genuine Rime-offered
  voices/models, versus placeholder names picked by whoever wrote this integration,
  was not checked against Rime's actual documentation or API.

## Limitations

- Live success-path behavior (real key → real audio bytes) is **untested** — this
  review had neither a Rime API key nor outbound network/npm access. The runtime
  script above is provided so you (with real credentials and a normal dev machine)
  can close that gap in under a minute.
- Even a future "PASS C" from the runtime script would **not** by itself confirm
  end-to-end user-audible success: `pcmToWavBlob` in `ttsService.ts` auto-detects
  WAV/MP3/OGG vs raw PCM by magic bytes, and that logic was reviewed but not
  exercised against a real Rime response payload. A valid-looking `{audio, provider:
  "rime"}` response could still fail to play correctly client-side if this detection
  logic is wrong. Closing Test C should include confirming the decoded audio actually
  plays, not just that bytes were returned (see the added decode check in Test C of
  the runtime script).
- The `if (rimeApiKey)` truthiness check has not been verified against
  whitespace-only or otherwise malformed key values (see Test E) — only confirmed
  empty-string and fully-unset cases behave as expected, and even those only by
  reading, not execution.
- "Ultra-low latency" and prosody-quality claims in the UI copy are marketing
  language and are not benchmarked here — the evidence above only supports "the
  integration is structured to fail gracefully," not "it is fast," "it sounds good,"
  or even "it produces audio at all" (see Test C status above).
- The two advertised models (`coda` vs `mist`) and the speaker allow-list
  (`albion, victoria, astra, celeste, orion, lyra, masonry`) are validated for shape
  only (`VALID_RIME_SPEAKERS` set in `server.ts`); neither their existence in Rime's
  real catalog nor their actual voice differences were verified.
- This document is a self-review of the codebase (see Reviewer note at top), not an
  independently executed audit. No one has yet run the runtime script with a real
  key against a live server.
