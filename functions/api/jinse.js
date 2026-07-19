const BASE_URL = "https://www.jinse.com.cn";
const LIVES_URL = `${BASE_URL}/lives`;
const FORESIGHT_BASE_URL = "https://foresightnews.pro";
const FORESIGHT_NEWS_URL = `${FORESIGHT_BASE_URL}/news`;
const ODAILY_NEWSFLASH_URL = "https://www.odaily.news/zh-CN/newsflash";
const ODAILY_API_URL = "https://web-api.odaily.news/newsflash/page";
const SHANGHAI_TZ = "Asia/Shanghai";

function absoluteUrl(url) {
  if (!url) {
    return LIVES_URL;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(".cn.cn/", ".cn/");
  }
  return `${BASE_URL}${url}`.replace(".cn.cn/", ".cn/");
}

function absoluteForesightUrl(url) {
  if (!url) {
    return FORESIGHT_NEWS_URL;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${FORESIGHT_BASE_URL}${url}`;
}

function absoluteOdailyUrl(id) {
  const itemId = String(id || "").trim();
  if (!itemId) {
    return ODAILY_NEWSFLASH_URL;
  }
  return `${ODAILY_NEWSFLASH_URL}/${encodeURIComponent(itemId)}`;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function getDateParts(timestamp) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const part of formatter.formatToParts(new Date(timestamp))) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return map;
}

function parseTimeLabelToday(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return 0;
  }
  const now = new Date();
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(match[1]),
    Number(match[2]),
  );
  if (date.getTime() - now.getTime() > 30 * 60000) {
    date.setDate(date.getDate() - 1);
  }
  return date.getTime();
}

function splitTopLevel(input) {
  const parts = [];
  let current = "";
  let depthBrace = 0;
  let depthBracket = 0;
  let depthParen = 0;
  let inString = false;
  let quoteChar = "";
  let escaped = false;

  for (const ch of String(input || "")) {
    current += ch;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quoteChar) {
        inString = false;
        quoteChar = "";
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      continue;
    }
    if (ch === "{") depthBrace += 1;
    else if (ch === "}") depthBrace -= 1;
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket -= 1;
    else if (ch === "(") depthParen += 1;
    else if (ch === ")") depthParen -= 1;
    else if (ch === "," && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
      parts.push(current.slice(0, -1));
      current = "";
    }
  }

  if (current.trim()) {
    parts.push(current);
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

function decodeJsString(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw.slice(1, -1);
  }
}

function buildAliasMap(html) {
  const pageHtml = String(html || "");
  const start = pageHtml.indexOf("__NUXT__=(function(");
  const end = pageHtml.indexOf("</script>", start);
  if (start === -1 || end === -1) {
    return new Map();
  }
  const chunk = pageHtml.slice(start, end);
  const match = chunk.match(
    /__NUXT__=\(function\(([^)]*)\)\{return[\s\S]*?\}\(([\s\S]*)\)\);?$/,
  );
  if (!match) {
    return new Map();
  }

  const params = match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const args = splitTopLevel(match[2]);
  const aliases = new Map();

  params.forEach((name, index) => {
    const raw = (args[index] || "").trim();
    if (!raw) {
      return;
    }
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      aliases.set(name, decodeJsString(raw));
      return;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
      aliases.set(name, Number(raw));
      return;
    }
    if (raw === "null") {
      aliases.set(name, null);
      return;
    }
    if (raw === "!0") {
      aliases.set(name, true);
      return;
    }
    if (raw === "!1") {
      aliases.set(name, false);
    }
  });

  return aliases;
}

function extractArrayBlock(html, label, nextLabel) {
  const match = String(html || "").match(
    new RegExp(`${label}:\\[(.*?)\\],${nextLabel}:`, "s"),
  );
  return match ? match[1] : "";
}

function splitObjectItems(block) {
  const objects = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let quoteChar = "";
  let escaped = false;

  for (const ch of String(block || "")) {
    if (inString) {
      current += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quoteChar) {
        inString = false;
        quoteChar = "";
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      current += ch;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      current += ch;
      if (depth === 0 && current.trim()) {
        objects.push(current.trim());
        current = "";
      }
      continue;
    }
    if (depth > 0) {
      current += ch;
    }
  }

  return objects;
}

function splitKeyValue(segment) {
  let inString = false;
  let quoteChar = "";
  let escaped = false;
  let depthBrace = 0;
  let depthBracket = 0;
  let depthParen = 0;

  for (let index = 0; index < segment.length; index += 1) {
    const ch = segment[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quoteChar) {
        inString = false;
        quoteChar = "";
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      continue;
    }
    if (ch === "{") depthBrace += 1;
    else if (ch === "}") depthBrace -= 1;
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket -= 1;
    else if (ch === "(") depthParen += 1;
    else if (ch === ")") depthParen -= 1;
    else if (ch === ":" && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
      return [segment.slice(0, index).trim(), segment.slice(index + 1).trim()];
    }
  }

  return [segment.trim(), ""];
}

function parseObject(objectLiteral, aliases) {
  const inner = objectLiteral.replace(/^\{/, "").replace(/\}$/, "");
  const data = {};

  for (const part of splitTopLevel(inner)) {
    const [key, rawValue] = splitKeyValue(part);
    data[key] = resolveToken(rawValue, aliases);
  }

  return data;
}

function resolveToken(token, aliases) {
  const raw = String(token || "").trim();
  if (!raw) {
    return "";
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return decodeJsString(raw);
  }
  if (aliases.has(raw)) {
    return aliases.get(raw);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  if (raw === "null") return null;
  if (raw === "!0") return true;
  if (raw === "!1") return false;
  return raw;
}

function normalizeSupplementItem(raw, prefix) {
  const timestamp = Number(raw.published_at || 0) * 1000;
  if (!timestamp) {
    return null;
  }
  const title = stripTags(raw.title || raw.short_title || "");
  const summary = stripTags(raw.short_title || raw.title || "");
  const url = absoluteUrl(String(raw.jump_url || "").replace(/\\u002F/g, "/"));
  if (title.length <= 2 || summary.length <= 2 || !/^https?:\/\//.test(url)) {
    return null;
  }
  const parts = getDateParts(timestamp);
  return {
    id: `${prefix}-${raw.id || raw.jump_url || raw.title}`,
    title,
    summary,
    timeLabel: `${parts.hour}:${parts.minute}`,
    source: "金色财经",
    url,
    timestamp,
  };
}

function extractSupplementItems(html) {
  const aliases = buildAliasMap(html);
  const blocks = [
    extractArrayBlock(html, "breakingNewsList", "searchHotsData"),
    extractArrayBlock(html, "recommendationData", "FilteredTagData"),
  ];
  const items = [];
  const seen = new Set();

  for (const [index, block] of blocks.entries()) {
    for (const objectLiteral of splitObjectItems(block)) {
      const raw = parseObject(objectLiteral, aliases);
      const item = normalizeSupplementItem(raw, `extra${index + 1}`);
      if (!item || seen.has(item.url)) {
        continue;
      }
      seen.add(item.url);
      items.push(item);
    }
  }

  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

function extractVisibleItems(html) {
  const blocks = html.match(/<div class="js-lives js-lives__item">[\s\S]*?<\/div>\s*<\/div>/g) || [];
  const items = [];

  for (const block of blocks) {
    const titleMatch = block.match(
      /<a[^>]*class="title"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<a[^>]*href="([^"]+)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/,
    );
    const summaryMatches = [...block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const timeMatch = block.match(/<div class="time">\s*([\d:]+)\s*<\/div>/);
    if (!titleMatch || !summaryMatches.length) {
      continue;
    }

    const summaryMatch = summaryMatches.length > 1 ? summaryMatches[1] : summaryMatches[0];
    const href = titleMatch[1] || titleMatch[3];
    const title = stripTags(titleMatch[2] || titleMatch[4]);
    const summary = stripTags(summaryMatch[2]);
    const timeLabel = timeMatch ? timeMatch[1] : "";
    const idMatch = href.match(/(\d+)\.html/);
    const timestamp = parseTimeLabelToday(timeLabel);

    items.push({
      id: idMatch ? idMatch[1] : href,
      title,
      summary,
      timeLabel,
      source: "金色财经",
      url: absoluteUrl(href),
      timestamp,
    });
  }

  return items;
}

function extractForesightItems(html, limit) {
  const pattern =
    /<div class="timeline-time"[^>]*>\s*([^<]+)\s*<\/div>[\s\S]*?<a href="([^"]+)"[^>]*class="news-card"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>\s*<div class="news-content"[^>]*>([\s\S]*?)<\/div>/gi;
  const items = [];
  const seenUrls = new Set();
  let match = null;

  while ((match = pattern.exec(html)) !== null) {
    const timeLabel = stripTags(match[1]);
    const href = match[2];
    const title = stripTags(match[3]);
    const summary = stripTags(match[4]);
    const url = absoluteForesightUrl(href);
    if (!title || !summary || seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);
    const idMatch = href.match(/\/news\/detail\/(\d+)/);
    items.push({
      id: `foresight-${idMatch ? idMatch[1] : url}`,
      title,
      summary,
      timeLabel,
      source: "Foresight News",
      url,
      timestamp: parseTimeLabelToday(timeLabel),
    });
    if (items.length >= limit) {
      break;
    }
  }

  return items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function extractOdailyItems(payload, limit) {
  const list = payload && payload.data && Array.isArray(payload.data.list) ? payload.data.list : [];
  const items = [];
  const seenUrls = new Set();

  for (const raw of list) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const title = stripTags(raw.title || "");
    const summary = stripTags(raw.description || "");
    const timestamp = Number(raw.publishTimestamp || 0);
    const url = absoluteOdailyUrl(raw.id);
    if (title.length <= 2 || summary.length <= 2 || seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);
    const parts = timestamp ? getDateParts(timestamp) : null;
    items.push({
      id: `odaily-${raw.id || url}`,
      title,
      summary,
      timeLabel: parts ? `${parts.hour}:${parts.minute}` : "",
      source: "Odaily星球日报",
      url,
      timestamp,
    });
    if (items.length >= limit) {
      break;
    }
  }

  return items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

async function fetchHtmlWithRetry(url, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), 30000);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          Referer: url,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function fetchJsonWithRetry(url, params, retries = 2) {
  const requestUrl = new URL(url);
  for (const [key, value] of Object.entries(params || {})) {
    requestUrl.searchParams.set(key, String(value));
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), 30000);
    try {
      const response = await fetch(requestUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          Accept: "application/json,text/plain,*/*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Referer: ODAILY_NEWSFLASH_URL,
          "x-locale": "zh-CN",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function mergeItems(...args) {
  const limit = Number(args.pop() || 50);
  const groups = args;
  const items = [];
  const seenUrls = new Set();

  const sortedItems = groups.flat().sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
  );

  for (const item of sortedItems) {
    if (!item || seenUrls.has(item.url)) {
      continue;
    }
    seenUrls.add(item.url);
    items.push(item);
    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const limit = Math.max(
    1,
    Math.min(80, Number.parseInt(requestUrl.searchParams.get("limit") || "50", 10) || 50),
  );

  try {
    const [jinseHtml, foresightHtml, odailyPayload] = await Promise.all([
      fetchHtmlWithRetry(LIVES_URL, 2).catch(() => ""),
      fetchHtmlWithRetry(FORESIGHT_NEWS_URL, 2).catch(() => ""),
      fetchJsonWithRetry(ODAILY_API_URL, { page: 1, size: limit }, 2).catch(() => null),
    ]);
    const visibleItems = jinseHtml ? extractVisibleItems(jinseHtml) : [];
    const supplementItems = jinseHtml ? extractSupplementItems(jinseHtml) : [];
    const jinseItems = mergeItems(visibleItems, supplementItems, limit);
    const foresightItems = foresightHtml ? extractForesightItems(foresightHtml, limit) : [];
    const odailyItems = odailyPayload ? extractOdailyItems(odailyPayload, limit) : [];
    const items = mergeItems(jinseItems, foresightItems, odailyItems, limit);
    if (!items.length) {
      throw new Error("Failed to fetch Jinse, Foresight, and Odaily news");
    }
    return jsonResponse(
      {
        siteTitle: "数字资产快讯",
        sourceUrl: LIVES_URL,
        articleCount: items.length,
        jinseArticleCount: jinseItems.length,
        foresightArticleCount: foresightItems.length,
        odailyArticleCount: odailyItems.length,
        items,
        isLive: true,
      },
      200,
    );
  } catch (error) {
    return jsonResponse(
      {
        state: 0,
        msg: `Failed to fetch Jinse news: ${String(error)}`,
        items: [],
      },
      502,
    );
  }
}
