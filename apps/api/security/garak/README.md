# 🛡️ LLM Red-Teaming: NVIDIA garak

Probes the LLM layer (reply classifier) for prompt-injection / jailbreak
vulnerabilities, using [NVIDIA garak](https://github.com/NVIDIA/garak). The
reply classifier is our #1 injection surface: it processes **untrusted prospect
replies** (OWASP LLM01), so an attacker could try to make it follow injected
instructions instead of classifying.

## How it works

```
garak ──HTTP POST {q: <attack>}──▶ /api/security/redteam ──▶ chat() raw output ──▶ garak detectors
        (probe payloads)            (real classifier prompt,        (looks for attack markers
                                      attack framed as a reply)       = successful bypass)
```

The endpoint (`app/api/security/redteam/route.ts`) is **default-off**: it returns
404 unless `ENABLE_REDTEAM=1`, and can be gated further with `REDTEAM_SECRET`.
**Never enable it on a public production deployment.**

## Run it locally

```bash
# 1. install garak
python -m venv .venv && source .venv/bin/activate && pip install garak

# 2. run the app with the probe endpoint + a real LLM (in apps/api)
ENABLE_REDTEAM=1 OLLAMA_API_KEY=<your-ollama-cloud-key> npm run dev

# 3. scan (from apps/api/security/garak)
bash run_audit.sh
#   or: npm run test:llm:security   (from apps/api)
```

## Prioritized probes

| Probe | What it tests | Notes |
|-------|---------------|-------|
| `promptinject` | Classic jailbreaks / instruction hijacks | |
| `latentinjection` | Payload hidden in supplied content | **The real risk**: a malicious reply trying to override classification |
| `dan` | Do-Anything-Now personas | Watch the FR false positives below |

Override with `GARAK_PROBES=...`.

## ⚠️ Known false positives (do NOT "fix" these)

- **`dan.*` / `mitigation.MitigationBypass` at 80-100%**: the detector looks for
  *English* refusals ("I cannot", "I'm sorry"). Our prompt/model may refuse
  correctly in **French** ("Je ne peux pas…") and still fail the English
  detector. Read the actual output before concluding a real bypass.
- **`dan.Ablation*` with very long prompts**: input caps can truncate the
  payload (the guardrail working), so no DAN marker appears.

**Real vulnerabilities to act on:** `latentinjection.*` where the attack marker
(e.g. "pwned") actually appears in the classifier output: that is a true
injection bypass and must be patched (tighten the system prompt / add an input
guard in the classifier).

## Analyzing

`analyze_report.py` prints a probe×detector pass-rate table + failure samples and
exits non-zero if any pair drops below `GARAK_MIN_PASS_RATE` (default 0.70). CI
uses this as the gate.
