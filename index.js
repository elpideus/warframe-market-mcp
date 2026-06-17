#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { loadSession, saveSession, clearSession } from "./src/session.js";
import { apiFetch, ok, BASE_V1, BASE_V2 } from "./src/api.js";

let session = loadSession();
const getSession = () => session;
const api = (url, opts) => apiFetch(url, opts, getSession);

const server = new McpServer({ name: "warframe-market", version: "2.0.0" });

// ── Auth ──────────────────────────────────────────────────────────────────────

async function doSignin(email, password, existingDeviceId) {
  const deviceId = existingDeviceId ?? randomUUID();
  const res = await fetch(`${BASE_V1}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "JWT" },
    body: JSON.stringify({ auth_type: "header", email, password, device_id: deviceId }),
  });
  const authHeader = res.headers.get("Authorization");
  if (!authHeader) throw new Error(`Sign-in failed (${res.status}): ${await res.text()}`);
  return { token: authHeader.replace(/^JWT\s+/i, ""), deviceId, cookie: res.headers.get("Set-Cookie") ?? undefined };
}

server.tool(
  "wfm_signin",
  "Sign in with email/password. Stores the JWT for this session and persists it to disk so restarts don't require re-login.",
  {
    email: z.string().describe("Warframe Market email or username"),
    password: z.string().describe("Password"),
  },
  async ({ email, password }) => {
    session = await doSignin(email, password, session?.deviceId);
    saveSession(session);
    return ok({ success: true, deviceId: session.deviceId });
  }
);

server.tool(
  "wfm_signout",
  "Sign out and clear stored credentials.",
  {},
  async () => {
    if (!session?.token) return ok({ success: true, note: "No active session." });
    try { await api(`${BASE_V2}/auth/signout`, { method: "POST" }); } catch { /* best-effort */ }
    session = null;
    clearSession();
    return ok({ success: true });
  }
);

server.tool(
  "wfm_auth_status",
  "Check whether a session token is currently stored.",
  {},
  async () => ok({ authenticated: !!session?.token })
);

// ── Items ─────────────────────────────────────────────────────────────────────

server.tool(
  "wfm_search_items",
  "Search tradable items by name. Returns id, url_name, item_name, thumb per match. Use url_name as the slug for all other item tools.",
  {
    query: z.string().describe("Partial item name, e.g. 'ash prime'"),
    limit: z.number().int().min(1).max(200).optional().describe("Max results (default 20)"),
    language: z.string().optional().describe("Language code, e.g. 'en', 'de'"),
  },
  async ({ query, limit = 20, language }) => {
    const data = await api(`${BASE_V2}/items`, { language });
    const items = data?.data ?? data ?? [];
    const q = query.toLowerCase();
    const matches = items
      .filter(i => (i.i18n?.en?.name ?? i.item_name ?? i.name ?? "").toLowerCase().includes(q))
      .slice(0, limit)
      .map(i => ({ id: i.id, slug: i.slug ?? i.url_name, item_name: i.i18n?.en?.name ?? i.item_name ?? i.name, thumb: i.i18n?.en?.thumb ?? i.thumb }));
    return ok({ total_matches: matches.length, items: matches });
  }
);

server.tool(
  "wfm_get_item",
  "Get details for an item by URL slug. Set include_set=true to also return all items in the same set.",
  {
    slug: z.string().describe("Item URL slug from wfm_search_items, e.g. 'ash_prime_set'"),
    include_set: z.boolean().optional().describe("Also fetch the full set this item belongs to (default false)"),
    language: z.string().optional(),
  },
  async ({ slug, include_set, language }) => {
    const [item, set] = await Promise.all([
      api(`${BASE_V2}/item/${encodeURIComponent(slug)}`, { language }),
      include_set ? api(`${BASE_V2}/item/${encodeURIComponent(slug)}/set`, { language }) : null,
    ]);
    return ok(set ? { item, set } : item);
  }
);

server.tool(
  "wfm_get_item_statistics",
  "Get price statistics for an item: 90-day daily history and 48-hour hourly breakdown. Good for trend analysis.",
  { slug: z.string().describe("Item URL slug, e.g. 'ash_prime_neuroptics'") },
  async ({ slug }) => ok(await api(`${BASE_V1}/items/${encodeURIComponent(slug)}/statistics`))
);

// ── Orders ────────────────────────────────────────────────────────────────────

server.tool(
  "wfm_get_top_orders",
  "Get the top 5 buy and top 5 sell orders for an item from currently online users. Best starting point for a price check.",
  {
    slug: z.string().describe("Item URL slug"),
    rank: z.number().int().optional().describe("Exact mod rank (mods only)"),
    subtype: z.string().optional().describe("e.g. 'blueprint', 'crafted'"),
    platform: z.enum(["pc", "ps4", "xbox", "switch", "mobile"]).optional(),
    crossplay: z.boolean().optional(),
  },
  async ({ slug, rank, subtype, platform, crossplay }) => {
    const params = new URLSearchParams();
    if (rank !== undefined) params.set("rank", String(rank));
    if (subtype) params.set("subtype", subtype);
    const qs = params.toString() ? `?${params}` : "";
    return ok(await api(`${BASE_V2}/orders/item/${encodeURIComponent(slug)}/top${qs}`, { platform, crossplay }));
  }
);

server.tool(
  "wfm_get_orders_for_item",
  "Get buy/sell orders for an item from users online in the last 7 days. Prefer wfm_get_top_orders for quick price checks.",
  {
    slug: z.string().describe("Item URL slug"),
    order_type: z.enum(["buy", "sell", "all"]).optional().describe("Filter by type (default 'all')"),
    limit: z.number().int().min(1).max(500).optional().describe("Max orders to return (default 30)"),
    platform: z.enum(["pc", "ps4", "xbox", "switch", "mobile"]).optional(),
    crossplay: z.boolean().optional(),
  },
  async ({ slug, order_type = "all", limit = 30, platform, crossplay }) => {
    const data = await api(`${BASE_V2}/orders/item/${encodeURIComponent(slug)}`, { platform, crossplay });
    const orders = data?.data ?? data ?? [];
    const filtered = order_type === "all" ? orders : orders.filter(o => o.order_type === order_type);
    return ok({ total: filtered.length, orders: filtered.slice(0, limit) });
  }
);

server.tool(
  "wfm_get_recent_orders",
  "Get the most recent orders across all items (last 4 hours). Returns up to limit orders (default 50, max 500).",
  {
    limit: z.number().int().min(1).max(500).optional().describe("Max orders to return (default 50)"),
    platform: z.enum(["pc", "ps4", "xbox", "switch", "mobile"]).optional(),
    crossplay: z.boolean().optional(),
  },
  async ({ limit = 50, platform, crossplay }) => {
    const data = await api(`${BASE_V2}/orders/recent`, { platform, crossplay });
    const orders = data?.data ?? data ?? [];
    return ok({ total: orders.length, orders: orders.slice(0, limit) });
  }
);

server.tool(
  "wfm_get_user_orders",
  "Get orders for a user. Omit slug to get your own orders (requires sign-in). Provide a username to view any public user's orders. IMPORTANT: Always display the item's name (item.item_name or item.en.item_name) prominently for every order — never substitute it with a category label like 'Mod' or 'Resource', and never show a raw item ID in place of the name.",
  { slug: z.string().optional().describe("Username/profile slug. Omit for your own orders.") },
  async ({ slug }) => {
    const url = slug ? `${BASE_V2}/orders/user/${encodeURIComponent(slug)}` : `${BASE_V2}/orders/my`;
    const [data, items] = await Promise.all([api(url), api(`${BASE_V2}/items`)]);
    const idToName = Object.fromEntries(
      (items?.data ?? items ?? []).map(i => [i.id, i.i18n?.en?.name ?? i.item_name ?? i.name])
    );
    const orders = (data?.data ?? data ?? []).map(o => ({ item_name: idToName[o.itemId] ?? null, ...o }));
    return ok({ ...data, data: orders });
  }
);

server.tool(
  "wfm_get_order",
  "Get a single order by its ID.",
  { id: z.string().describe("Order ID") },
  async ({ id }) => ok(await api(`${BASE_V2}/order/${encodeURIComponent(id)}`))
);

server.tool(
  "wfm_create_order",
  "Create a new buy or sell order (requires sign-in).",
  {
    item_id: z.string().describe("Item ID from wfm_get_item"),
    order_type: z.enum(["buy", "sell"]),
    platinum: z.number().int().describe("Price in platinum"),
    quantity: z.number().int().describe("Quantity to trade"),
    rank: z.number().int().optional().describe("Mod rank (mods only)"),
    subtype: z.string().optional().describe("e.g. 'blueprint'"),
    visible: z.boolean().optional().describe("Whether the order is visible (default true)"),
  },
  async ({ item_id, order_type, platinum, quantity, rank, subtype, visible }) => {
    const body = { itemId: item_id, type: order_type, platinum, quantity };
    if (rank !== undefined) body.rank = rank;
    if (subtype) body.subtype = subtype;
    if (visible !== undefined) body.visible = visible;
    return ok(await api(`${BASE_V2}/order`, { method: "POST", body }));
  }
);

server.tool(
  "wfm_manage_order",
  "Update, delete, or close (mark sold) an order (requires sign-in). action='update': change price/qty/visibility. action='delete': remove. action='close': mark quantity as sold.",
  {
    id: z.string().describe("Order ID"),
    action: z.enum(["update", "delete", "close"]),
    platinum: z.number().int().optional().describe("New price (update only)"),
    quantity: z.number().int().optional().describe("New quantity (update) or quantity sold (close)"),
    visible: z.boolean().optional().describe("Toggle visibility (update only)"),
    rank: z.number().int().optional().describe("New mod rank (update only)"),
  },
  async ({ id, action, platinum, quantity, visible, rank }) => {
    const encoded = encodeURIComponent(id);
    if (action === "delete") return ok(await api(`${BASE_V2}/order/${encoded}`, { method: "DELETE" }));
    if (action === "close") return ok(await api(`${BASE_V2}/order/${encoded}/close`, { method: "POST", body: { quantity } }));
    const body = Object.fromEntries(Object.entries({ platinum, quantity, visible, rank }).filter(([, v]) => v !== undefined));
    return ok(await api(`${BASE_V2}/order/${encoded}`, { method: "PATCH", body }));
  }
);

server.tool(
  "wfm_update_order_group",
  "Toggle visibility for a group of orders at once (requires sign-in). group_id='all' affects everything, 'ungrouped' affects only ungrouped orders.",
  {
    group_id: z.string().describe("'all' or 'ungrouped'"),
    visible: z.boolean(),
  },
  async ({ group_id, visible }) =>
    ok(await api(`${BASE_V2}/orders/group/${encodeURIComponent(group_id)}`, { method: "PATCH", body: { visible } }))
);

// ── Profile & Achievements ────────────────────────────────────────────────────

server.tool(
  "wfm_get_profile",
  "Get a user profile. Omit slug to get your own private profile (requires sign-in). Provide a username slug for any public profile.",
  { slug: z.string().optional().describe("Username/profile slug. Omit for your own profile.") },
  async ({ slug }) => ok(await api(slug ? `${BASE_V2}/user/${encodeURIComponent(slug)}` : `${BASE_V2}/me`))
);

server.tool(
  "wfm_get_achievements",
  "Get achievements. Omit slug for the full achievement list. Provide a username slug for that user's progress.",
  { slug: z.string().optional().describe("Username slug for user progress. Omit for full list.") },
  async ({ slug }) =>
    ok(await api(slug ? `${BASE_V2}/achievements/user/${encodeURIComponent(slug)}` : `${BASE_V2}/achievements`))
);

// ── Static / Manifest Data ────────────────────────────────────────────────────

server.tool("wfm_get_versions", "Get current resource version numbers. Use to check if local caches of items/attributes are stale.",
  {}, async () => ok(await api(`${BASE_V2}/versions`)));

server.tool(
  "wfm_get_riven_data",
  "Get Riven mod static data. type='weapons' → all weapons that can have Rivens. type='attributes' → all possible Riven stats.",
  { type: z.enum(["weapons", "attributes"]), language: z.string().optional() },
  async ({ type, language }) => ok(await api(`${BASE_V2}/riven/${type}`, { language }))
);

server.tool(
  "wfm_get_progenitor_weapons",
  "Get weapon lists for progenitor-type enemies. type='lich' → Kuva Lich weapons. type='sister' → Sister of Parvos weapons.",
  { type: z.enum(["lich", "sister"]), language: z.string().optional() },
  async ({ type, language }) => ok(await api(`${BASE_V2}/${type}/weapons`, { language }))
);

// ── Start ─────────────────────────────────────────────────────────────────────

if (!session?.token && process.env.WFM_EMAIL && process.env.WFM_PASSWORD) {
  try {
    session = await doSignin(process.env.WFM_EMAIL, process.env.WFM_PASSWORD);
    saveSession(session);
  } catch { /* non-fatal: tools will fail auth-requiring calls */ }
}

const transport = new StdioServerTransport();
await server.connect(transport);
