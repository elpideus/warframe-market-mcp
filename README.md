# Warframe Market MCP

MCP server for the [Warframe Market API v2](https://42bytes.notion.site/WFM-Api-v2-Documentation-5d987e4aa2f74b55a80db1a09932459d).

## Setup

Omit the `-e` flags for read-only, unauthenticated access.

### Claude Code

```bash
claude mcp add warframe-market -e WFM_EMAIL=you@example.com -e WFM_PASSWORD=hunter2 -- npx -y warframe-market-mcp
```

Add `--scope global` to install for all projects. Or add to `~/.claude/mcp.json` (global) or `.claude/mcp.json` (project):

```json
{
  "mcpServers": {
    "warframe-market": {
      "command": "npx",
      "args": ["-y", "warframe-market-mcp"],
      "env": { "WFM_EMAIL": "you@example.com", "WFM_PASSWORD": "hunter2" }
    }
  }
}
```

### Gemini CLI

```bash
gemini mcp add warframe-market -e WFM_EMAIL=you@example.com -e WFM_PASSWORD=hunter2 -- npx -y warframe-market-mcp
```

Or add to `~/.gemini/settings.json` (global) or `.gemini/settings.json` (project):

```json
{
  "mcpServers": {
    "warframe-market": {
      "command": "npx",
      "args": ["-y", "warframe-market-mcp"],
      "env": { "WFM_EMAIL": "you@example.com", "WFM_PASSWORD": "hunter2" }
    }
  }
}
```

### OpenCode

```bash
opencode mcp add warframe-market -e WFM_EMAIL=you@example.com -e WFM_PASSWORD=hunter2 -- npx -y warframe-market-mcp
```

Or add to `opencode.json` in your project root:

```json
{
  "mcpServers": {
    "warframe-market": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "warframe-market-mcp"],
      "env": { "WFM_EMAIL": "you@example.com", "WFM_PASSWORD": "hunter2" }
    }
  }
}
```

## Tools

| Tool | Auth | Description |
|------|------|-------------|
| `wfm_signin` | — | Sign in, persists token to disk |
| `wfm_signout` | ✓ | Sign out and clear token |
| `wfm_auth_status` | — | Check if a session is active |
| `wfm_search_items` | — | Search tradable items by name |
| `wfm_get_item` | — | Item details by slug; optionally include full set |
| `wfm_get_item_statistics` | — | 90-day + 48h price history |
| `wfm_get_top_orders` | — | Top 5 buy + top 5 sell (online users only) |
| `wfm_get_orders_for_item` | — | All orders for an item |
| `wfm_get_recent_orders` | — | Most recent orders across all items (last 4h) |
| `wfm_get_user_orders` | ✓* | Orders for a user; omit slug for your own |
| `wfm_get_order` | — | Single order by ID |
| `wfm_create_order` | ✓ | Create buy/sell order |
| `wfm_manage_order` | ✓ | Update, delete, or close an order |
| `wfm_update_order_group` | ✓ | Bulk toggle visibility for `all` / `ungrouped` |
| `wfm_get_profile` | ✓* | User profile; omit slug for your own |
| `wfm_get_achievements` | — | Achievement list or user progress |
| `wfm_get_versions` | — | Resource version numbers (cache staleness check) |
| `wfm_get_riven_data` | — | Riven weapons or attributes |
| `wfm_get_progenitor_weapons` | — | Kuva Lich or Sister of Parvos weapons |

\* Public data works unauthenticated; own data requires sign-in.

## Rate limit

3 requests/second (sliding window). Backs off automatically on 429/509.
