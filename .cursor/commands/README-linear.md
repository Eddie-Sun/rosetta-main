# Linear Issue Creation Workflow

This directory contains commands for creating Linear issues directly from Cursor.

## Quick Start

1. **Set up Linear MCP** (one-time setup):
   - Run the `/linear-setup` command or see `linear-setup.md`
   - Or click: [Install Linear MCP](cursor://anysphere.cursor-deeplink/mcp/install?name=Linear&config=eyJ1cmwiOiJodHRwczovL21jcC5saW5lYXIuYXBwL3NzZSJ9)

2. **Create issues** using `/linear-issue` command or by asking Cursor directly

## Usage Modes

### Mode A: Selection-Based
1. Highlight code, error, or text in your editor
2. Run `/linear-issue` command or ask: "Create a Linear issue from this"
3. Cursor will:
   - Analyze the selection
   - Detect issue type (bug/feature/improvement)
   - Structure the issue appropriately
   - Create it in Linear
   - Return the issue URL

### Mode B: Freeform
1. Open Cursor chat
2. Type: "Create a Linear issue in team ENG titled 'Fix login bug' with description '...'"
3. Cursor will create the issue and return the URL

## Examples

**From Error Log:**
```
// Select this error:
Error: Cannot read property 'map' of undefined
  at Component.render (App.tsx:42)

// Then run: /linear-issue
```

**From TODO Comment:**
```
// Select this:
// TODO: Add dark mode toggle to settings

// Then run: /linear-issue
```

**Freeform:**
```
"Create a Linear issue in team ENG titled 'Add user profile page' with description 'Users need a profile page to manage their settings'"
```

## Files

- `linear-issue.md` - Main command for creating Linear issues
- `linear-setup.md` - Setup guide for Linear MCP integration

## Troubleshooting

**"No MCP resources found"**
- Linear MCP may not be configured
- Run `/linear-setup` or check `linear-setup.md`

**"Team not specified"**
- Cursor will list available teams
- Specify team in your request: "Create issue in team ENG..."

**Authentication issues**
- See `linear-setup.md` for troubleshooting steps
- Clear auth cache: `rm -rf ~/.mcp-auth`

## Features

✅ Automatic issue type detection (bug/feature/improvement)  
✅ Structured issue formatting  
✅ Context-aware descriptions  
✅ Team/workspace selection  
✅ Direct URL return  
✅ No browser/copy-paste needed  

## Next Steps

Once Linear MCP is configured, you can:
- Create issues from code selections
- Create issues from chat prompts
- Get issue URLs directly in Cursor
- Streamline your workflow without context switching


