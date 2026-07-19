# Smelt Lite — the starting point

> **Built by a non-CS college student, entirely with AI.** No hand-written code. Just an idea, a lot of conversations, and 1 billion tokens burned on the version that tried to do too much. This is the humble restart.
>
> A static webpage. Drag files in, get cards. Select cards, download a `.card` file. Drag a `.card` back in, see what's inside. Thirty seconds. No install. No signup. No AI model.

---

## What is this?

**Smelt Lite** is the first, smallest piece of Smelt. It does exactly one thing: prove that the `.card` format works.

- Drag any file in → a card preview appears
- Select cards → fill in a name → download `.card`
- Drag a `.card` in → unpack it → see everything inside

That's it. No canvas. No AI. No workbench. No dock. No modes.

This is the starting point after burning 1 billion tokens on a version that tried to do too much. Smelt Lite is built from scratch — about 10 source files, a few hundred lines, one clear job.

## What's a `.card`?

A `.card` file is a standard ZIP archive. Inside: your files, the full collaboration process (every prompt, every tool call, the AI's thinking traces), modification history, and cryptographic signatures. Rename it to `.zip` and open it with anything.

The format is open (MPL 2.0). Any application can read and write it.

## Why this exists

After spending hours working with AI on a research paper, I had nothing tangible to show for the process — no record of the thinking, no portable artifact, no way to share the work with someone else and let them continue.

Everyone is building better AI tools. Nobody is building the thing you take with you when you're done.

**Smelt doesn't compete with AI tools. Smelt harvests your conversations — from any AI tool — and turns them into portable `.card` files you own.**

## What this isn't

- Not an AI workbench
- Not a platform
- Not a Chrome extension (yet)
- Not a desktop app (yet)

## Where we're going

Smelt grows step by step, one `smelt-XX` at a time:

- **Smelt-Lite** ← you are here. Static webpage, define and validate `.card`
- **Smelt-Ext** — Chrome extension. One button on ChatGPT/Claude/Kimi, one click to `.card`
- **Smelt-Desk** — Desktop app. `.card` becomes a native file type. Double-click to open.

Each step is independently useful. None waits for the next.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
npx tsc --noEmit   # zero errors
```

## Author

Built by [@Che-A-Lu](https://github.com/Che-A-Lu) (Dalu Wang), Shanghai, July 2026.
Read this in Chinese: [README_ZH.md](README_ZH.md)
