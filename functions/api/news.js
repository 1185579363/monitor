const BASE_URL = "https://www.stcn.com";
const LIST_ENDPOINT = `${BASE_URL}/article/list.html`;
const REFERER_URL = `${BASE_URL}/article/list/kx.html`;
const SHANGHAI_TZ = "Asia/Shanghai";

function absoluteUrl(url) {
  if (!url) {
    return REFERER_URL;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${BASE_URL}${url}`;
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

function normalizeItem(raw) {
  const timestamp = Number(raw.time);
  const parts = getDateParts(timestamp);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => ({
        name: (tag?.name || "").trim(),
        code: (tag?.code || "").trim(),
        stockCode: (tag?.stock_code || "").trim(),
        url: absoluteUrl(tag?.url),
      }))
    : [];

  return {
    id: String(raw.id),
    title: (raw.title || "").trim(),
    summary: (raw.content || "").trim(),
    source: (raw.source || "人民财讯").trim(),
    url: absoluteUrl(raw.web_url || raw.url),
    timestamp,
    publishedAt: new Date(timestamp).toISOString(),
    publishedDate: `${parts.year}-${parts.month}-${parts.day}`,
    publishedTime: `${parts.hour}:${parts.minute}`,
    publishedLabel: `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`,
    isRed: Boolean(raw.isRed || raw.red),
    isTop: Boolean(raw.isTop),
    tags,
  };
}

async function fetchJsonWithRetry(url, options, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), 30000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
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

async function fetchPage(pageTime, lastTime) {
  const url = new URL(LIST_ENDPOINT);
  url.searchParams.set("type", "kx");
  if (pageTime !== undefined && pageTime !== null) {
    url.searchParams.set("page_time", String(pageTime));
  }
  if (lastTime !== undefined && lastTime !== null) {
    url.searchParams.set("last_time", String(lastTime));
  }

  const payload = await fetchJsonWithRetry(
    url.toString(),
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Referer: REFERER_URL,
        "X-Requested-With": "XMLHttpRequest",
      },
    },
    2,
  );

  if (payload.state !== 1) {
    throw new Error(payload.msg || "Unexpected upstream response");
  }
  return payload;
}

async function fetchItems(maxPages) {
  let pageTime;
  let lastTime;
  let pagesFetched = 0;
  const seenIds = new Set();
  const items = [];

  for (let i = 0; i < maxPages; i += 1) {
    const payload = await fetchPage(pageTime, lastTime);
    const rows = Array.isArray(payload.data) ? payload.data : [];
    if (!rows.length) {
      break;
    }

    pagesFetched += 1;
    for (const raw of rows) {
      const item = normalizeItem(raw);
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        items.push(item);
      }
    }

    pageTime = payload.page_time;
    lastTime = payload.last_time;
    if (pageTime == null || lastTime == null) {
      break;
    }
  }

  items.sort((a, b) => b.timestamp - a.timestamp);
  return { items, pagesFetched };
}

function buildPayload(items, pagesFetched) {
  const generatedAt = Date.now();
  const generatedParts = getDateParts(generatedAt);
  const topTags = new Map();

  for (const item of items) {
    for (const tag of item.tags) {
      if (!tag.name) {
        continue;
      }
      topTags.set(tag.name, (topTags.get(tag.name) || 0) + 1);
    }
  }

  return {
    siteTitle: "人民财讯快线",
    sourceName: "证券时报网",
    sourceUrl: REFERER_URL,
    generatedAt: new Date(generatedAt).toISOString(),
    generatedAtLabel: `${generatedParts.year}-${generatedParts.month}-${generatedParts.day} ${generatedParts.hour}:${generatedParts.minute}:00`,
    pagesFetched,
    articleCount: items.length,
    redCount: items.filter((item) => item.isRed).length,
    sourceCount: new Set(items.map((item) => item.source)).size,
    topTags: [...topTags.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count })),
    items,
  };
}

async function loadCachedPayload(context) {
  if (!context.env?.ASSETS?.fetch) {
    return null;
  }
  const assetUrl = new URL("/news-data.json", context.request.url);
  const response = await context.env.ASSETS.fetch(assetUrl);
  if (!response.ok) {
    return null;
  }
  return await response.json();
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
  const pages = Math.max(
    1,
    Math.min(20, Number.parseInt(requestUrl.searchParams.get("pages") || "3", 10) || 3),
  );

  try {
    const { items, pagesFetched } = await fetchItems(pages);
    const payload = buildPayload(items, pagesFetched);
    payload.isLive = true;
    payload.isFallback = false;
    return jsonResponse(payload, 200);
  } catch (error) {
    const cachedPayload = await loadCachedPayload(context);
    if (cachedPayload) {
      cachedPayload.isLive = false;
      cachedPayload.isFallback = true;
      cachedPayload.fallbackReason = String(error);
      return jsonResponse(cachedPayload, 200);
    }

    return jsonResponse(
      {
        state: 0,
        msg: `Failed to fetch live news: ${String(error)}`,
      },
      502,
    );
  }
}
