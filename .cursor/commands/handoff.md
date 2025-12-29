# Generate Teammate Handoff Prompt

Generate a prompt for handing off work to another AI agent (Codex, Claude Code). The receiving agent has no context from this session, so the prompt must be self-contained and actionable. This supports any follow-up: continuation, investigation, review, or exploration.

## Git Context

Gather the following git information using terminal commands:

**Working Directory**: `pwd`

**Repository**: `basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"`

**Branch**: `git branch --show-current 2>/dev/null || echo "detached/unknown"`

**Uncommitted changes**: `git diff --stat 2>/dev/null || echo "None"`

**Staged changes**: `git diff --cached --stat 2>/dev/null || echo "None"`

**Recent commits (last 4 hours)**: `git log --oneline -5 --since="4 hours ago" 2>/dev/null || echo "None"`

## Session Context

Review the conversation history from this session to understand:
- What task was requested and why
- What approach was taken
- Decisions made or tradeoffs discussed
- Current state: what's done, in progress, or blocked
- Open questions or areas of uncertainty
- Known issues or incomplete items

## Additional Focus

If the user provided additional focus area or notes in their command, include that context.

## Task

Write a handoff prompt to `~/.claude/handoffs/handoff-<repo>-<shortname>.md` where:
- `<repo>` is the repository basename (from git context above)
- `<shortname>` is derived from the branch name (sanitize: remove special chars, keep alphanumeric and hyphens, max 30 chars)
  - Examples: `handoff-myapp-sen-69.md`, `handoff-api-fix-auth.md`, `handoff-rosetta-feat-cache.md`

After writing, copy the file contents to clipboard using the appropriate command for the platform:
- macOS: `pbcopy`
- Linux: `xclip -selection clipboard` or `wl-copy` (if available)
- Windows: `clip` (if available)
- If clipboard command fails, inform the user they can manually copy the file

The prompt must be standalone and actionable for an agent with zero prior context.

### Prompting Guidelines

Apply these when writing the handoff:
- **Be explicit and detailed** - include context on *why*, not just *what*
- **Use action-oriented language** - direct instructions like "Continue implementing..." not "Can you look at..."
- **Avoid negation** - frame positively (say what to do, not what to avoid)
- **Use XML tags** for clear section delimitation

### Role/Framing

Analyze the session to determine the best framing for the receiving agent:
- If the work needs **review**: use a reviewer role (e.g., "You are a senior engineer reviewing...")
- If the work needs **continuation**: use an implementer framing (e.g., "You are picking up implementation of...")
- If there's an **issue to investigate**: use a debugger framing (e.g., "You are investigating...")
- If **no specific role fits**: use neutral teammate framing (e.g., "You are picking up work from a teammate...")

Choose whichever produces the strongest, most actionable prompt for the situation.

### Output Structure

Use this XML-tagged structure:

```xml
<role>
[Your chosen framing based on session context - be specific about what the agent should do]
</role>

<context>
[2-4 sentences: what was being worked on, why, approach taken, key decisions made]
</context>

<current_state>
[What's done, what's in progress, what's blocked or uncertain]
</current_state>

<key_files>
[Files involved with brief descriptions of changes/relevance]
</key_files>

<next_steps>
[Action-oriented tasks for the receiving agent. Be specific. Examples:
- "Continue implementing the X feature by adding Y to Z file"
- "Review changes in A, B, C focusing on error handling"
- "Investigate why the build fails when running X command"]
</next_steps>
```

### Output Method

1. **Ensure directory exists**: `mkdir -p ~/.claude/handoffs`

2. **Generate filename**: 
   - Get repo name from git context
   - Get branch name and sanitize it (remove special chars, keep alphanumeric and hyphens, truncate to 30 chars)
   - Format: `handoff-<repo>-<shortname>.md`

3. **Write the handoff prompt** to the file

4. **Copy to clipboard**:
   - Try platform-specific clipboard command
   - If it fails, inform user they can manually copy from the file path

5. **Confirm**: "Handoff saved to ~/.claude/handoffs/<filename> and copied to clipboard."

## Example Output

```xml
<role>
You are a senior engineer picking up implementation of a cache invalidation API endpoint. Continue the work that was started in this session.
</role>

<context>
We're adding a cache invalidation API to allow customers to manually trigger re-crawls of URLs. This is needed because content updates can take up to 24h to propagate to AI crawlers otherwise. The approach uses HMAC signatures for authentication and deletes KV cache entries by hash.
</context>

<current_state>
- POST /_rosetta/invalidate route handler skeleton added to worker/index.js
- InvalidatePayload type defined
- HMAC signature validation logic partially implemented (needs timestamp check)
- KV deletion logic not yet added
- No tests written yet
</current_state>

<key_files>
- worker/index.js (lines 240-280): New route handler for POST /_rosetta/invalidate
- lib/types.ts: InvalidatePayload interface definition
</key_files>

<next_steps>
- Complete HMAC signature validation by adding timestamp check (reject if >5min old)
- Add KV deletion logic: canonicalize URL → compute hash → delete md:${hash} from KV
- Add error handling for invalid signatures
- Write tests for the endpoint (valid signature, invalid signature, expired timestamp)
- Update rules.md with the new endpoint documentation
</next_steps>
```

## Important Notes

- **Never skip git context** - Always gather the git information first
- **Be thorough in session analysis** - Review the full conversation to understand context
- **File paths matter** - Include specific file paths and line numbers when relevant
- **Action-oriented** - Every next step should be a clear, actionable task
- **Self-contained** - The handoff should work even if the receiving agent has no access to this conversation

