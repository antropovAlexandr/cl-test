# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup        # First-time setup: install deps, generate Prisma client, run migrations
npm run dev          # Start dev server with Turbopack
npm run build        # Production build
npm run lint         # ESLint via next lint
npm run test         # Run all tests with Vitest
npm run db:reset     # Reset database (prisma migrate reset --force)
```

Run a single test file:
```bash
npx vitest run src/path/to/test.test.ts
```

## Architecture

UIGen is an AI-powered React component generator with live preview. Users describe UI in chat; Claude generates files via tool calls; the browser previews them instantly — no build step needed.

### Data Flow

1. **User sends message** → `ChatProvider` (`src/lib/contexts/chat-context.tsx`) calls `POST /api/chat` with the messUse age history + serialized VirtualFileSystem state.
2. **Server** (`src/app/api/chat/route.ts`) reconstructs a `VirtualFileSystem` from the payload, calls `streamText` (Vercel AI SDK) with two tools: `str_replace_editor` and `file_manager`.
3. **Claude streams tool calls** — the client's `onToolCall` hook in `FileSystemProvider` (`src/lib/contexts/file-system-context.tsx`) intercepts each call and applies it to the in-memory VFS immediately.
4. **`refreshTrigger` counter** increments on each file change, causing `PreviewFrame` to re-render.
5. **Preview** (`src/components/preview/PreviewFrame.tsx`): Babel-transforms all JSX in-browser via `@babel/standalone`, builds an import map (local files → Blob URLs, packages → `esm.sh`), and injects a full HTML document into a sandboxed `<iframe>` via `srcdoc`.
6. **On stream finish**: if the user is authenticated and a `projectId` exists, the updated messages + VFS state are persisted to SQLite via Prisma.

### Virtual File System

`src/lib/file-system.ts` — a `VirtualFileSystem` class backed by `Map<string, FileNode>`. This is the central data structure. It never writes to disk; the entire generated codebase lives in memory (serialized to JSON in the DB `data` column). The AI tools (`str_replace_editor`, `file_manager`) are the only way files are created/modified.

### AI Tools

- `src/lib/tools/str-replace.ts` — `str_replace_editor`: `view`, `create`, `str_replace`, `insert` operations on the VFS.
- `src/lib/tools/file-manager.ts` — `file_manager`: `rename`, `delete` operations.
- `src/lib/prompts/generation.tsx` — system prompt instructing Claude to generate `App.jsx` as the entry point, use Tailwind, use `@/` import aliases.

### Auth

JWT in HTTP-only cookies (7-day expiry), signed with `JWT_SECRET` env var. Server actions in `src/actions/index.ts` handle `signUp`, `signIn`, `signOut`. Auth is optional — anonymous users can use the full app; `src/lib/anon-work-tracker.ts` stores their work in `sessionStorage` for recovery after sign-up.

### Mock Mode

If `ANTHROPIC_API_KEY` is absent, `src/lib/provider.ts` returns a `MockLanguageModel` that simulates tool-calling without any API calls. The full UI is functional without credentials.

### Key Conventions

- Use comments sparingly — only for complex or non-obvious logic.
- The AI model is `claude-haiku-4-5` (configured in `src/app/api/chat/route.ts`).
- shadcn/ui components live in `src/components/ui/`; add new ones with `npx shadcn@latest add <component>`.
- Tailwind v4 is used — no `tailwind.config.js`; configuration is in CSS via `@theme`.
- Database: SQLite via Prisma. Schema changes require `npx prisma migrate dev`.
