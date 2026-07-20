# .card Standard Prompts v2

> Copy these prompts into any AI tool — ChatGPT, Claude, Kimi, DeepSeek, etc.
> v2 adds: automatic conversation type detection + three output modes.

---

## Warning: Token Cost

**Any recovery mode re-reads the entire conversation. Longer conversations = higher cost. Physics cannot be bypassed.**

| Mode | Input Tokens | Output Tokens | Best For |
|---|---|---|---|
| **Scene A** (pre-install prompt) | Full (but this is the conversation itself — no extra cost) | Depends on type | Any conversation. **Recommended.** |
| **Minimal recovery** (summary only) | Full (processed again) | ~5K | Accept input cost, want light output |
| **Full recovery** (summary + trail/worklog) | Full (processed again) | Up to 200K | Need full detail, conversation <50 rounds |

**Bottom line: recovery mode input cost cannot be avoided. The only difference is output size. For long conversations, use Smelt Lite's fill-form or paste mode instead.**

---

## Conversation Types

Not all conversations suit the same output. The AI auto-detects the type and chooses the format:

| Type | Characteristics | Output |
|---|---|---|
| **Decision record** | Direction discussions, option comparisons, key decisions, turning points | summary.json + trail.jsonl |
| **Work log** | Execution tasks, coding, debugging, environment setup, file processing | summary.json + worklog.jsonl |
| **Quick note** | Q&A, concept explanations, recommendations, one-off queries | summary.json only |

### Universal format rules (all prompts)

- JSON in ` ```json ` code blocks, JSONL in ` ```jsonl `
- `branches` items: `{"id":1,"what":"...","why":"...","who_decided":"..."}` — not plain strings
- `decisions` items: `{"id":1,"what":"...","why":"...","by":"..."}` — not plain strings
- `files` items: `{"name":"...","role":"..."}` — not plain strings
- `status` max 20 chars, `done` max 30 chars
- Don't fabricate. Missing fields = empty arrays or null

---

## Scene A-1: Pre-install prompt

**Usage**: Paste at the start of a new conversation. The AI tracks in the background throughout. Token cost is negligible. ~150 chars.

---

> In this collaboration, maintain a collaboration record in the background. No output needed, no reply needed. What to track depends on the conversation type: for discussion/decision type, track direction changes and key decisions; for engineering/execution type, track each step and result; for Q&A type, track questions and answers. At the end, I will ask you to output structured JSON. Do not output before then.

---

## Scene A-2: End prompt

**Usage**: Paste at the end of the conversation. The AI outputs JSON based on its memory of the entire session. ~500 chars.

**If the AI can generate files**: creates files directly.
**If web-based AI**: outputs in code blocks. Save manually.

---

> ## Output Collaboration Record
>
> ### Step 0: Determine conversation type
>
> Determine which type this conversation falls into:
> - **Decision record**: has direction discussions, option comparisons, key decisions, turning points. Output summary.json + trail.jsonl
> - **Work log**: primarily execution tasks (coding, debugging, setup, file processing). Output summary.json + worklog.jsonl
> - **Quick note**: Q&A, concept explanations, recommendations. Output summary.json only
>
> ### Output method
>
> If you can generate files: create the files directly.
> If web-based AI: use code blocks (` ```json `, ` ```jsonl `). User saves manually.
>
> ---
>
> ### All types must output: summary.json
>
> ` ``jsonc
> {
>   "format": "card-v1",
>   "title": "Project name",
>   "description": "One sentence summary",
>   "created": "2026-07-19T10:30:00Z",
>   "human": { "name": "Name", "role": "Role description" },
>   "ai": { "model": "Model name", "role": "Role description" },
>   "status": "Current stage (free text)",
>   "done": "What's been completed, one sentence",
>   "current": "What you're working on",
>   "blocked": null,
>   "next": ["Next step 1", "Next step 2"],
>   "branches": [],
>   "decisions": [],
>   "files": []
> }
> ` ``
>
> **Field notes**: title/description/human/ai/status/current/next required. done/blocked recommended. branches: {id, what, why, who_decided}. decisions: {id, what, why, by}. files: {name, role}. Don't fabricate uncertain information.
>
> ---
>
> ### Decision record: trail.jsonl
>
> One state change per line. Not a conversation log — only state change points. Maintenance dialogue (follow-ups, explanations, detail confirmations) not included.
>
> ` ``jsonc
> {"id":"s1","type":"branch|decision|progress|block|file","summary":"one sentence","context":[{"role":"human|ai","text":"the key original words triggering the change"}],"before":"before","after":"after","confidence":"high|medium|low","collab_ids":[1]}
> ` ``
>
> **Constraints**: context max 3 messages, each ≤150 chars. Use original words, not summaries. Only the key triggering sentence. If unsure, keep and mark confidence: "low".
>
> ---
>
> ### Work log: worklog.jsonl
>
> One work step per line. Record action, result, produced files. Don't record debugging or error resolution.
>
> ` ``jsonc
> {"step":1,"action":"Set up Vite + React project skeleton","result":"Success, npm run dev works","files":["package.json","vite.config.ts"],"note":""}
> ` ``
>
> **Fields**: step (incrementing), action (what was done), result (outcome), files (produced files), note (optional).
> **Constraints**: only record steps with tangible output. Typically 5-15 entries.
>
> Now please output.

---

## Scene B-Minimal: Summary only (recommended fallback)

**Usage**: Conversation has ended without pre-installed prompt. Outputs only summary.json. ~200 chars.

---

> ## Output Collaboration Summary (Minimal)
>
> Extract a summary.json from our conversation.
>
> ` ``jsonc
> {
>   "format": "card-v1",
>   "title": "Project name",
>   "description": "One sentence",
>   "created": "2026-07-19T10:30:00Z",
>   "human": { "name": "Name", "role": "Role" },
>   "ai": { "model": "Model name", "role": "Role" },
>   "status": "Current stage (≤20 chars)",
>   "done": "Completed (≤30 chars, one sentence)",
>   "current": "Working on",
>   "blocked": null,
>   "next": ["Step 1", "Step 2"],
>   "branches": [
>     {"id":1,"what":"From A to B","why":"Reason","who_decided":"Who"}
>   ],
>   "decisions": [
>     {"id":1,"what":"What decision","why":"Reason","by":"Who"}
>   ],
>   "files": [
>     {"name":"filename","role":"Purpose"}
>   ]
> }
> ` ``
>
> **Constraints**: `status` ≤20 chars, `done` ≤30 chars. `branches`/`decisions` must use the object structure above, not plain strings. Empty arrays if you don't remember. Don't fabricate.
>
> Output using ` ```json ` code block.

---

## Scene B-Full: Recovery mode (High Token Cost)

**Usage**: Conversation ended without pre-installed prompt, and you need full detail (trail or worklog). ~600 chars.

**Warning: the AI re-reads the entire conversation. Long conversations can reach millions of input tokens. Only use when you genuinely need trail.jsonl or worklog.jsonl.**

---

> ## Extract Collaboration Record from Conversation History (Recovery Mode)
>
> ### Step 0: Determine conversation type
>
> Determine which type:
> - **Decision record**: direction discussions, option comparisons, turning points. Output summary.json + trail.jsonl
> - **Work log**: primarily execution tasks. Output summary.json + worklog.jsonl
> - **Quick note**: Q&A. Output summary.json only
>
> ### Step 1: Scan for state changes
>
> **Decision record** — look for:
> - Direction changes ("change direction", "try this angle", "that's wrong")
> - Key decisions (explicitly said "use X", "choose X", "decide X")
> - Progress milestones ("X is done", "next step")
> - Blocked ("need your confirmation", "waiting for you")
> - Produced files
>
> **Work log** — look for:
> - Steps with tangible output (created files, got features working, fixed bugs)
> - Skip intermediate debugging, trial-and-error
>
> Maintenance dialogue (follow-ups, explanations, format confirming) should not be marked.
>
> ### Step 2: Extract key original text (Decision record only)
>
> Find the sentence that triggered each change. 1-3 messages, each ≤150 chars. Original words, not summaries.
>
> ### Step 3: Output
>
> If you can generate files: create them directly.
> If web-based AI: use code blocks (` ```json `, ` ```jsonl `).
>
> #### summary.json (all types required)
>
> ` ``jsonc
> {
>   "format": "card-v1",
>   "title": "Project name",
>   "description": "One sentence",
>   "created": "2026-07-19T10:30:00Z",
>   "human": { "name": "Name", "role": "Role" },
>   "ai": { "model": "Model name", "role": "Role" },
>   "status": "Current stage",
>   "done": "Completed",
>   "current": "Working on",
>   "blocked": null,
>   "next": ["Step 1", "Step 2"],
>   "branches": [],
>   "decisions": [],
>   "files": []
> }
> ` ``
>
> branches: {id, what, why, who_decided}. decisions: {id, what, why, by}. files: {name, role}.
>
> #### trail.jsonl (Decision record only)
>
> ` ``jsonc
> {"id":"s1","type":"branch|decision|progress|block|file","summary":"one sentence","context":[{"role":"human|ai","text":"key original words triggering the change"}],"before":"before","after":"after","confidence":"high|medium|low","collab_ids":[1]}
> ` ``
>
> Constraints: context max 3 messages, each ≤150 chars. Original words. Only state change points.
>
> #### worklog.jsonl (Work log only)
>
> ` ``jsonc
> {"step":1,"action":"What was done","result":"Outcome","files":["file"],"note":""}
> ` ``
>
> Only record steps with output. Typically 5-15 entries.
>
> ### Important constraints
>
> - Don't fabricate. Mark uncertain fields confidence: "low".
> - Unsure about conversation type? Default to decision record.
> - branches/decisions id from 1. trail id from "s1". worklog step from 1.
>
> Now please output.

---

## User Flow

### Scene A (Recommended)

```
1. Copy "Pre-install prompt" → paste at start of new conversation → chat normally
2. When done → copy "End prompt" → paste → AI outputs JSON
3. Web AI: copy code blocks → save as files
   File-capable AI: files auto-generated
4. Open Smelt Lite → drag JSON in → add files → pack → download .card
```

### Scene B-Minimal (Recovery, recommended)

```
1. Paste "Minimal recovery" prompt at end of existing conversation
2. AI outputs summary.json → save
3. Open Smelt Lite → drag in → pack → download .card
```

### Scene B-Full (Recovery, high token)

```
1. Only use when trail/worklog is genuinely needed
2. Paste "Full recovery" prompt at end of existing conversation
3. AI outputs JSON → save
4. Same as Scene A step 4
```
