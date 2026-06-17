export const BASE_V2 = "https://api.warframe.market/v2";
export const BASE_V1 = "https://api.warframe.market/v1";

// ponytail: sliding window; upgrade to token bucket if WFM tightens limits
const reqTimes = [];
async function rateLimit() {
  const now = Date.now();
  while (reqTimes.length && reqTimes[0] < now - 1000) reqTimes.shift();
  if (reqTimes.length >= 3) {
    await new Promise(r => setTimeout(r, reqTimes[0] + 1000 - now + 10));
    return rateLimit();
  }
  reqTimes.push(Date.now());
}

// session is injected so api.js stays stateless
export async function apiFetch(url, options = {}, getSession, attempt = 0) {
  await rateLimit();
  const session = getSession?.();

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Platform: options.platform ?? "pc",
      Language: options.language ?? "en",
      ...(options.crossplay !== undefined ? { Crossplay: String(options.crossplay) } : {}),
      ...(session?.token ? { Authorization: url.includes("/v2/") ? `Bearer ${session.token}` : `JWT ${session.token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if ((res.status === 429 || res.status === 509) && attempt < 3) {
    await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    return apiFetch(url, options, getSession, attempt + 1);
  }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${typeof data === "object" ? JSON.stringify(data) : data}`);
  return data;
}

export function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
