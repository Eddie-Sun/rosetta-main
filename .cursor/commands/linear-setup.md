# Linear MCP Setup Guide

This guide helps you set up Linear's MCP (Model Context Protocol) integration in Cursor to enable direct issue creation.

## Quick Setup

### Option 1: Direct Install (Recommended)

1. Click this link to install Linear MCP in Cursor:
   [Install Linear MCP](cursor://anysphere.cursor-deeplink/mcp/install?name=Linear&config=eyJ1cmwiOiJodHRwczovL21jcC5saW5lYXIuYXBwL3NzZSJ9)

2. Or search for "Linear" in Cursor's [MCP tools page](https://docs.cursor.com/en/tools/mcp)

3. Follow the authentication flow to connect your Linear account

### Option 2: Manual Configuration

1. Open Cursor Settings (`Cmd/Ctrl + ,`)
2. Navigate to **Features** → **MCP**
3. Click **Add Server**
4. Enter the following configuration:

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.linear.app/mcp"]
    }
  }
}
```

5. Save and restart Cursor
6. Authenticate with Linear when prompted

## Verify Setup

After setup, you can verify the integration by:

1. Opening Cursor chat
2. Asking: "List my Linear teams" or "Show Linear MCP tools"
3. If configured correctly, you should see Linear teams/tools available

## Troubleshooting

### "No MCP resources found"
- Ensure Linear MCP server is added and started
- Check that authentication completed successfully
- Try restarting Cursor

### Authentication Issues
- Clear saved auth: `rm -rf ~/.mcp-auth` (in Terminal)
- Re-authenticate through Cursor settings
- Ensure you have Linear account access

### Connection Errors
- Verify your internet connection
- Check if Linear's MCP server is accessible: `https://mcp.linear.app/mcp`
- Update Node.js if using older version

## Usage

Once set up, use the `/linear-issue` command or ask Cursor to create Linear issues directly.

Example:
- "Create a Linear issue from this error" (with code selected)
- "Create a Linear issue in team ENG titled 'Fix login bug'"
- Use the `/linear-issue` command from the command palette

## More Information

- [Linear MCP Documentation](https://linear.app/integrations/cursor-mcp)
- [Cursor MCP Documentation](https://docs.cursor.com/en/tools/mcp)


