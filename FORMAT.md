# .card File Format Specification v1.0

> **Status**: Draft. Implemented in Smelt reference implementation.
> **License**: MPL 2.0 — implement freely in any language.

---

## 1. Overview

A `.card` file is a **ZIP archive** (standard ZIP, no compression required) containing a structured record of one human-AI collaboration session.

**Rename to `.zip` and open with any archive tool.** Every part of the format is human-readable JSON or the original artifact files.

**Purpose**: Package the complete output of human-AI collaboration — process, artifacts, provenance — into a single portable file that any compatible space can open and continue.

---

## 2. Container

- **Format**: ZIP (RFC 1951)
- **File extension**: `.card`
- **Size limit**: None specified (practical limit depends on browser OPFS quota)

---

## 3. Internal Structure

```
example.card
├── manifest.json        # REQUIRED. Metadata, file inventory with hashes
├── signature.json       # REQUIRED. Cryptographic provenance chain
├── content/             # REQUIRED. All artifact files
│   ├── data.xlsx
│   ├── report.md
│   └── cleanup.py
├── shell/               # OPTIONAL. Theme/shell configuration
│   ├── theme.json
│   └── style.css
├── process.jsonl        # OPTIONAL. Full collaboration process log
├── edits.json           # OPTIONAL. Modification history across re-exports
└── README.md            # OPTIONAL. Human-readable guide
```

---

## 4. File Specifications

### 4.1 `manifest.json` (REQUIRED)

```json
{
  "id": "abc123def456",
  "label": "Q3 Sales Analysis",
  "version": "1.0.0",
  "author": "Dalu Wang",
  "description": "AI-assisted analysis of Q3 sales data with SWOT framework",
  "tags": ["analysis", "sales", "Q3", "SWOT"],
  "requires": [],
  "createdAt": 1721123400000,
  "exportedAt": 1721123500000,
  "files": {
    "data.xlsx": "sha256:a1b2c3d4e5f6...",
    "report.md": "sha256:f6e5d4c3b2a1...",
    "cleanup.py": "sha256:1a2b3c4d5e6f..."
  }
}
```

**Fields**:

| Field | Required | Type | Description |
|-------|:---:|------|-------------|
| `id` | ✅ | string | Unique identifier (UUID or nanoid) |
| `label` | ✅ | string | Human-readable name (shown in space) |
| `version` | ❌ | string | Semantic version (e.g. "1.0.0") |
| `author` | ❌ | string | Creator's name or handle |
| `description` | ❌ | string | Free-text description |
| `tags` | ❌ | string[] | Searchable tags (lowercase recommended) |
| `requires` | ❌ | string[] | External dependencies (model names, tools) |
| `createdAt` | ❌ | number | Unix timestamp (ms) of original creation |
| `exportedAt` | ❌ | number | Unix timestamp (ms) of this export |
| `files` | ❌ | object | Map of `fileName → sha256:hash`. Per-file integrity verification |
| `_encrypted` | ❌ | boolean | If true, content files are encrypted (AES-256-GCM). Set by export tool |
| `_verify` | ❌ | string | Encrypted verification token. Used to check password on import |

**Encryption**: When `_encrypted` is true, each file in `content/` is individually encrypted. The decryption key is derived from the user's password via PBKDF2 (100,000 iterations, SHA-256). The `_verify` token contains a known plaintext encrypted with the same password — used to validate the password before attempting full decryption.

### 4.2 `signature.json` (REQUIRED)

```json
{
  "contentHash": "sha256:abc123def456...",
  "provenance": [
    {
      "author": "Dalu Wang",
      "publicKey": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
      "contentHash": "sha256:abc123def456...",
      "sig": "base64-encoded-ECDSA-signature",
      "timestamp": 1721123400000
    },
    {
      "author": "Li Ming",
      "publicKey": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
      "contentHash": "sha256:xyz789...",
      "sig": "base64-encoded-ECDSA-signature",
      "timestamp": 1721200000000
    }
  ]
}
```

**Provenance chain**:
- Each entry in `provenance[]` is a `SignatureEntry` — one person's signature
- The first entry is the original creator. Each subsequent entry is a re-export with modifications
- `contentHash`: SHA-256 hash of all content files (sorted by name, format `name:content`, concatenated with `\n`)
- `sig`: ECDSA P-256 signature over the string `"${author}|${contentHash}"`
- Import verification: verify every entry in the chain. All must pass for the chain to be valid.
- The `publicKey` in each entry is the signer's public key in JWK format

### 4.3 `content/` Directory (REQUIRED)

Contains the actual artifact files in their original formats:

- **Binary files** (`.xlsx`, `.png`, `.pdf`): stored as-is (raw bytes)
- **Text files** (`.md`, `.json`, `.csv`, `.py`, `.js`, `.txt`): stored as UTF-8
- **Encryption**: When `manifest._encrypted` is true, each file is individually AES-256-GCM encrypted. The encrypted file content is stored as a JSON wrapper:

```json
{
  "encrypted": true,
  "iv": [0, 1, 2, ...],
  "salt": [0, 1, 2, ...],
  "data": [0, 1, 2, ...]
}
```

- `iv` and `salt` are Uint8Arrays serialized as number arrays
- `data` is the encrypted ciphertext

### 4.4 `process.jsonl` (OPTIONAL)

JSON Lines format: one JSON object per line, representing each step in the collaboration.

```jsonl
{"role":"user","content":"Analyze this sales data with SWOT framework"}
{"role":"assistant","content":"I'll analyze using SWOT...","thinking":"Let me first read the data structure to understand what columns are available..."}
{"type":"tool_call","tool":"card_read","args":{"cardId":"sales-data"},"result":"[sales-data.csv]\nDate,Sales,Region,Product\n2024-01,12000,East,...","timestamp":1721123410000}
{"role":"assistant","content":"Based on the data, here is the SWOT analysis:\n\n**Strengths**: ...","thinking":""}
```

**Fields per line**:

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | `"user"` or `"assistant"` |
| `content` | string | Message text |
| `thinking` | string | AI's thinking trace (may be empty) |
| `type` | string | `"tool_call"` for tool invocations |
| `tool` | string | Tool name (for tool_call lines) |
| `args` | object | Tool arguments (for tool_call lines) |
| `result` | string | Tool execution result (for tool_call lines) |
| `timestamp` | number | Unix timestamp (ms) |

### 4.5 `edits.json` (OPTIONAL)

Records every modification across re-exports. Only present if the .card has been re-exported at least once.

```json
{
  "originalAuthor": "Dalu Wang",
  "originalHash": "sha256:abc123...",
  "chain": [
    {
      "editor": "Li Ming",
      "timestamp": 1721200000000,
      "note": "Updated Q3 data references, removed outdated template",
      "changes": {
        "added": ["conclusion.md"],
        "removed": ["old_template.md"],
        "modified": [
          {
            "file": "report.md",
            "oldHash": "sha256:f6e5d4...",
            "newHash": "sha256:987fed..."
          }
        ]
      }
    }
  ]
}
```

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `originalAuthor` | string | Who created the original .card |
| `originalHash` | string | SHA-256 of original content |
| `chain[]` | array | Ordered list of modifications |
| `chain[].editor` | string | Who made this modification |
| `chain[].timestamp` | number | Unix timestamp (ms) |
| `chain[].note` | string | Free-text explanation of changes |
| `chain[].changes.added` | string[] | New files added |
| `chain[].changes.removed` | string[] | Files removed |
| `chain[].changes.modified[]` | object | Files changed, with old and new hashes |

### 4.6 `shell/` Directory (OPTIONAL)

Theme configuration for the Smelt space. Contains:

- **`theme.json`** — Shell theme definition (color palette, font preferences)
- **`style.css`** — Custom CSS overrides

This directory is for UI customization and is not required for the .card to be functional. Spaces that don't support theming silently ignore the shell directory.

---

## 5. Hash Algorithm

All hashes use **SHA-256**, prefixed with `sha256:`.

**Per-file hash** (`manifest.files`):

```
sha256(name + ":" + content)
```

**Combined content hash** (`signature.json.contentHash`):

```
sha256(sorted files with name:content joined by \n)
```

Sorted by file name ascending (lexicographic order), to ensure deterministic hashing regardless of file addition order.

---

## 6. Encryption

- **Algorithm**: AES-256-GCM
- **Key derivation**: PBKDF2, 100,000 iterations, SHA-256
- **Parameters per file**: Random 16-byte salt, random 12-byte IV
- **Password strength categories**: weak (< 6 chars or low complexity), medium (≥ 6 chars, 2+ character classes), strong (≥ 10 chars, 3+ classes with special chars)

Encryption is per-file, not whole-archive. This allows selective decryption on import — the user can verify the password on one file before decrypting all.

---

## 7. Signature & Trust

- **Algorithm**: ECDSA P-256 (NIST P-256 curve)
- **Key format**: JWK (JSON Web Key), stored in OPFS
- **Signature format**: Base64-encoded raw signature bytes
- **Signed payload**: `"${authorName}|${contentHash}"`
- **Trust model**: Decentralized. Each space maintains a local trust list (LocalStorage). Trust is built through repeated encounters — not a central certificate authority.

**Fingerprint**: SHA-256 of `publicKey.x + publicKey.y`, first 16 hex characters. Displayed in import UI for user recognition.

**Verification on import**:
1. Verify every signature in the provenance chain
2. Compare each entry's `contentHash` to the current content
3. If the chain is valid but a hash doesn't match → content was modified without signing
4. Show trust status based on local trust list

---

## 8. Implementer's Checklist

To be `.card`-compatible, an application must:

- [ ] Read and write standard ZIP archives with `.card` extension
- [ ] Parse `manifest.json` and validate required fields
- [ ] Read `signature.json` and verify the provenance chain
- [ ] Extract files from `content/` directory
- [ ] Handle encrypted files (AES-256-GCM with PBKDF2 key derivation)
- [ ] Parse `edits.json` and display modification history
- [ ] Parse `process.jsonl` (optional — spaces that don't render chat history can skip)

A minimal reader that only extracts content files and ignores signatures/edits/process is still partially compatible.

---

## 9. Comparison to Related Formats

| Format | Container | Purpose | .card difference |
|--------|-----------|---------|-----------------|
| `.ipynb` | JSON | Code + output notebook | .card includes provenance, encryption, multi-file support |
| `.docx` | ZIP+XML | Word processing document | .card preserves AI process (prompts, tool calls, thinking) |
| `.clan` | ZIP+YAML | Agent-to-agent handoff | .card targets human users, includes visual workspace context |
| `.capsule` | ZIP | Collaborative work artifact | .card adds per-file hash verification and decentralized trust |
| `.aifp` | ZIP | AI-generated project | .card focuses on collaboration process, not just project output |
