const BASE_URL = "https://www.stcn.com";
const LIST_ENDPOINT = `${BASE_URL}/article/list.html`;
const REFERER_URL = `${BASE_URL}/article/list/kx.html`;
const JIEMIAN_MOBILE_URL = "https://m.jiemian.com/lists/4.html";
const JIEMIAN_DESKTOP_URL = "https://www.jiemian.com/lists/4.html";
const JIEMIAN_AJAX_URL = "https://a.jiemian.com/mobile/index.php?m=lists&a=ajaxNews&cid=4";
const KEJI_FEED_URL = "https://kejikuaixun.blogspot.com/feeds/posts/default?alt=json&max-results=30";
const KEJI_SITE_URL = "https://kejikuaixun.blogspot.com/";
const STAR_MARKET_TELEGRAPH_URL = "https://www.chinastarmarket.cn/telegraph";
const STAR_MARKET_CACHE_URL = "https://www.chinastarmarket.cn/api/cache";
const JINGJI_GLOBAL_URL = "https://www.21jingji.com/channel/global/";
const JINGJI_GLOBAL_API_URL = "https://m.21jingji.com/channel/global";
const JINGJI_AUTH_URL = "https://m.21jingji.com/reader/cbhChannelAuth?";
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

function normalizeImageUrl(url) {
  let imageUrl = decodeHtml(String(url || "").trim());
  if (!imageUrl || imageUrl.startsWith("data:")) {
    return "";
  }
  if (imageUrl.startsWith("//")) {
    imageUrl = `https:${imageUrl}`;
  }
  if (imageUrl.startsWith("/")) {
    imageUrl = absoluteUrl(imageUrl);
  }
  if (!/^https?:\/\//.test(imageUrl)) {
    return "";
  }
  const ignoredParts = ["default_img", "logo", "favicon", "loader.gif", "avatar"];
  if (ignoredParts.some((part) => imageUrl.toLowerCase().includes(part))) {
    return "";
  }
  return imageUrl;
}

function extractFirstImage(value) {
  const text = String(value || "");
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi,
    /<img[^>]+(?:data-original|data-src|src)=["']([^"']+)["']/gi,
  ];
  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(text)) !== null) {
      const imageUrl = normalizeImageUrl(match[1]);
      if (imageUrl) {
        return imageUrl;
      }
    }
  }
  return "";
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

function flattenStcnTags(rawTags) {
  const flattened = [];

  function walk(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (value && typeof value === "object") {
      flattened.push(value);
    }
  }

  walk(rawTags);
  return flattened;
}

function normalizeStcnItem(raw) {
  const timestamp = Number(raw.time);
  const parts = getDateParts(timestamp);
  const imageUrl = normalizeImageUrl(
    raw.image || raw.cover || raw.thumb || raw.pic || raw.share?.image,
  );
  const tags = flattenStcnTags(raw.tags).map((tag) => ({
        name: (tag?.name || "").trim(),
        code: (tag?.code || "").trim(),
        stockCode: (tag?.stock_code || "").trim(),
        url: absoluteUrl(tag?.url),
      }));

  return {
    id: String(raw.id),
    title: (raw.title || "").trim(),
    summary: (raw.content || "").trim(),
    source: (raw.source || "人民财讯").trim(),
    url: absoluteUrl(raw.web_url || raw.url),
    imageUrl,
    imageAlt: (raw.title || "").trim(),
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

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanHtmlText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeJiemianUrl(rawUrl) {
  const match = String(rawUrl || "").match(/\/article\/(\d+)\.html/);
  if (!match) {
    return rawUrl || JIEMIAN_DESKTOP_URL;
  }
  return `https://www.jiemian.com/article/${match[1]}.html`;
}

function normalizeJiemianItem(articleId, title, summary, dateText, timeText, rawUrl) {
  const timestamp = Date.parse(`${dateText}T${timeText}:00+08:00`);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const parts = getDateParts(timestamp);
  const url = normalizeJiemianUrl(rawUrl);
  return {
    id: `jiemian-${articleId}`,
    title,
    summary,
    source: "界面新闻",
    url,
    imageUrl: "",
    imageAlt: title,
    timestamp,
    publishedAt: new Date(timestamp).toISOString(),
    publishedDate: `${parts.year}-${parts.month}-${parts.day}`,
    publishedTime: `${parts.hour}:${parts.minute}`,
    publishedLabel: `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`,
    isRed: false,
    isTop: false,
    tags: [],
  };
}

function isJiemianContentImage(url) {
  const lower = String(url || "").toLowerCase();
  const ignoredParts = ["jiemian_logo", "loader.gif", "avatar", "logo.svg", "/static/"];
  return Boolean(lower) && !ignoredParts.some((part) => lower.includes(part));
}

function normalizeJiemianImageUrl(url) {
  let imageUrl = decodeHtml(String(url || "").trim());
  if (!imageUrl || imageUrl.startsWith("data:")) {
    return "";
  }
  if (imageUrl.startsWith("//")) {
    imageUrl = `https:${imageUrl}`;
  }
  if (imageUrl.startsWith("/")) {
    imageUrl = `https://www.jiemian.com${imageUrl}`;
  }
  if (!/^https?:\/\//.test(imageUrl) || !isJiemianContentImage(imageUrl)) {
    return "";
  }
  return imageUrl;
}

function extractJiemianArticleImage(html) {
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi,
    /<img[^>]+(?:data-original|data-src|src)=["']([^"']+)["']/gi,
  ];
  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(html)) !== null) {
      const imageUrl = normalizeJiemianImageUrl(match[1]);
      if (imageUrl) {
        return imageUrl;
      }
    }
  }
  return "";
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

async function fetchTextWithRetry(url, options, retries = 2) {
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

async function fetchStcnPage(pageTime, lastTime) {
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

async function fetchStcnItems(maxPages) {
  let pageTime;
  let lastTime;
  let pagesFetched = 0;
  const seenIds = new Set();
  const items = [];

  for (let i = 0; i < maxPages; i += 1) {
    const payload = await fetchStcnPage(pageTime, lastTime);
    const rows = Array.isArray(payload.data) ? payload.data : [];
    if (!rows.length) {
      break;
    }

    pagesFetched += 1;
    for (const raw of rows) {
      const item = normalizeStcnItem(raw);
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

function decodeJiemianAjaxHtml(payloadText) {
  let text = String(payloadText || "").trim();
  if (text.startsWith("(") && text.endsWith(")")) {
    text = text.slice(1, -1);
  }
  const payload = JSON.parse(text);
  return payload.rst || "";
}

function parseJiemianDesktopItems(rawHtml) {
  const items = [];
  const itemRegex =
    /<div\s+class="columns-right-center__newsflash-item\s*"[^>]*data-time="(\d+)"[^>]*data-id="(\d+)"[^>]*>[\s\S]*?<div class="columns-right-center__newsflash-date-node">([^<]+)<\/div>[\s\S]*?<h4><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h4>[\s\S]*?<div class="columns-right-center__newsflash-content__summary">([\s\S]*?)<\/div>/gi;
  let match = null;
  while ((match = itemRegex.exec(rawHtml)) !== null) {
    const timestamp = Number(match[1]) * 1000;
    if (!Number.isFinite(timestamp)) {
      continue;
    }
    const parts = getDateParts(timestamp);
    items.push({
      id: `jiemian-${match[2]}`,
      title: cleanHtmlText(match[5]),
      summary: cleanHtmlText(match[6]),
      source: "界面新闻",
      url: normalizeJiemianUrl(match[4]),
      timestamp,
      publishedAt: new Date(timestamp).toISOString(),
      publishedDate: `${parts.year}-${parts.month}-${parts.day}`,
      publishedTime: `${parts.hour}:${parts.minute}`,
      publishedLabel: `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`,
      isRed: false,
      isTop: false,
      tags: [],
    });
  }
  return items;
}

function parseJiemianChunk(rawHtml, currentDate) {
  const parts = String(rawHtml || "").split(/(<div class="col-date">\s*[^<]+?\s*<\/div>)/i);
  const items = [];
  let workingDate = currentDate || null;

  for (const part of parts) {
    if (!part) {
      continue;
    }

    const dateMatch = part.match(/^<div class="col-date">\s*([^<]+?)\s*<\/div>$/i);
    if (dateMatch) {
      workingDate = cleanHtmlText(dateMatch[1]);
      continue;
    }

    const itemRegex =
      /<div class="item-news[^"]*">[\s\S]*?<div class="item-date">\s*([^<]+?)\s*<\/div>[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*】?\s*([\s\S]*?)<\/p>/gi;
    let match = null;
    while ((match = itemRegex.exec(part)) !== null) {
      const rawUrl = match[2];
      const articleIdMatch = rawUrl.match(/\/article\/(\d+)\.html/);
      if (!articleIdMatch || !workingDate) {
        continue;
      }

      const item = normalizeJiemianItem(
        articleIdMatch[1],
        cleanHtmlText(match[3]),
        cleanHtmlText(match[4]),
        workingDate,
        cleanHtmlText(match[1]),
        rawUrl,
      );
      if (item) {
        items.push(item);
      }
    }
  }

  return { items, currentDate: workingDate };
}

async function enrichJiemianImages(items, limit = 18) {
  let enriched = 0;
  for (const item of items) {
    if (enriched >= limit) {
      break;
    }
    if (item.imageUrl) {
      continue;
    }
    try {
      const articleHtml = await fetchTextWithRetry(
        item.url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            Referer: JIEMIAN_DESKTOP_URL,
            "Cache-Control": "no-cache, no-store",
            Pragma: "no-cache",
          },
        },
        1,
      );
      const imageUrl = extractJiemianArticleImage(articleHtml);
      if (!imageUrl) {
        continue;
      }
      item.imageUrl = imageUrl;
      item.imageAlt = item.title || "";
      enriched += 1;
    } catch (error) {}
  }
}

async function fetchJiemianItems(maxPages = 3) {
  const desktopUrl = new URL(JIEMIAN_DESKTOP_URL);
  desktopUrl.searchParams.set("_", String(Date.now()));
  const desktopHtml = await fetchTextWithRetry(
    desktopUrl.toString(),
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Referer: JIEMIAN_DESKTOP_URL,
        "Cache-Control": "no-cache, no-store",
        Pragma: "no-cache",
      },
    },
    2,
  );
  const desktopItems = parseJiemianDesktopItems(desktopHtml);

  const mobileUrl = new URL(JIEMIAN_MOBILE_URL);
  mobileUrl.searchParams.set("_", String(Date.now()));
  const firstPageHtml = await fetchTextWithRetry(
    mobileUrl.toString(),
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Referer: JIEMIAN_MOBILE_URL,
        "Cache-Control": "no-cache, no-store",
        Pragma: "no-cache",
      },
    },
    2,
  );

  const pageMatch = firstPageHtml.match(/var page = (\d+);/);
  const dateSeedMatch = firstPageHtml.match(/var date = '([^']+)';/);
  if (!pageMatch || !dateSeedMatch) {
    throw new Error("Failed to locate Jiemian pagination seed");
  }

  const seenIds = new Set();
  const combinedItems = [];
  let currentDate = null;
  for (const item of desktopItems) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      combinedItems.push(item);
    }
  }

  const nextPage = Number.parseInt(pageMatch[1], 10);
  const dateSeed = dateSeedMatch[1];
  for (let page = nextPage; page < nextPage + Math.max(0, maxPages - 1); page += 1) {
    const ajaxUrl = new URL(JIEMIAN_AJAX_URL);
    ajaxUrl.searchParams.set("page", String(page));
    ajaxUrl.searchParams.set("date", dateSeed);
    const chunkText = await fetchTextWithRetry(
      ajaxUrl.toString(),
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          Referer: JIEMIAN_MOBILE_URL,
        },
      },
      2,
    );
    const parsed = parseJiemianChunk(decodeJiemianAjaxHtml(chunkText), currentDate);
    currentDate = parsed.currentDate;
    for (const item of parsed.items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        combinedItems.push(item);
      }
    }
  }

  combinedItems.sort((a, b) => b.timestamp - a.timestamp);
  await enrichJiemianImages(combinedItems);
  return combinedItems;
}

function getBloggerText(value) {
  if (value && typeof value === "object") {
    return String(value.$t || "");
  }
  return String(value || "");
}

function findBloggerAlternateUrl(entry) {
  const links = Array.isArray(entry?.link) ? entry.link : [];
  const alternate = links.find((link) => link?.rel === "alternate" && link?.href);
  return alternate?.href || KEJI_SITE_URL;
}

function stripLeadingTitle(summary, title) {
  if (title && summary.startsWith(title)) {
    return summary.slice(title.length).replace(/^[\s：:，,。\-—]+/, "");
  }
  return summary;
}

function normalizeKejiItem(entry) {
  const title = getBloggerText(entry?.title).trim();
  const publishedText = getBloggerText(entry?.published || entry?.updated);
  const timestamp = Date.parse(publishedText);
  if (!title || !Number.isFinite(timestamp)) {
    return null;
  }

  const content = getBloggerText(entry?.content || entry?.summary);
  const imageUrl = extractFirstImage(content);
  let summary = stripLeadingTitle(cleanHtmlText(content), title);

  const rawId = getBloggerText(entry?.id) || findBloggerAlternateUrl(entry);
  const postIdMatch = rawId.match(/\.post-(\d+)$/);
  const postId = postIdMatch ? postIdMatch[1] : rawId;
  const parts = getDateParts(timestamp);

  return {
    id: `keji-${postId}`,
    title,
    summary,
    source: "风向旗参考快讯",
    url: findBloggerAlternateUrl(entry),
    imageUrl,
    imageAlt: title,
    timestamp,
    publishedAt: new Date(timestamp).toISOString(),
    publishedDate: `${parts.year}-${parts.month}-${parts.day}`,
    publishedTime: `${parts.hour}:${parts.minute}`,
    publishedLabel: `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`,
    isRed: false,
    isTop: false,
    tags: (Array.isArray(entry?.category) ? entry.category : [])
      .map((category) => ({
        name: String(category?.term || "").trim(),
        code: "",
        stockCode: "",
        url: "",
      }))
      .filter((tag) => tag.name),
  };
}

async function fetchKejiItems(limit = 30) {
  const payload = await fetchJsonWithRetry(
    KEJI_FEED_URL,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
      },
    },
    2,
  );
  const entries = Array.isArray(payload?.feed?.entry) ? payload.feed.entry : [];
  const seenIds = new Set();
  const items = [];
  for (const entry of entries) {
    const item = normalizeKejiItem(entry);
    if (!item || seenIds.has(item.id)) {
      continue;
    }
    seenIds.add(item.id);
    items.push(item);
    if (items.length >= limit) {
      break;
    }
  }
  return items.sort((a, b) => b.timestamp - a.timestamp);
}

function normalizeStarMarketContent(content, title) {
  let text = String(content || "").replace(/\s+/g, " ").trim();
  if (title && text.startsWith(`【${title}】`)) {
    text = text.slice(title.length + 2).trim();
  }
  return stripLeadingTitle(text, title);
}

function normalizeStarMarketItem(raw) {
  const title = String(raw?.title || "").trim();
  const timestamp = Number(raw?.ctime) * 1000;
  if (!title || !Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  const parts = getDateParts(timestamp);
  const rawImages = Array.isArray(raw?.images) ? raw.images : [];
  const imageUrl = normalizeImageUrl(rawImages[0] || "");
  const itemId = String(raw?.id || `${timestamp}-${title}`);
  const level = String(raw?.level || "").toUpperCase();
  const subjects = Array.isArray(raw?.subjects) ? raw.subjects : [];

  return {
    id: `starmarket-${itemId}`,
    title,
    summary: normalizeStarMarketContent(raw?.content || title, title),
    source: "科创板日报",
    url: `https://www.chinastarmarket.cn/detail/${encodeURIComponent(itemId)}`,
    imageUrl,
    imageAlt: title,
    timestamp,
    publishedAt: new Date(timestamp).toISOString(),
    publishedDate: `${parts.year}-${parts.month}-${parts.day}`,
    publishedTime: `${parts.hour}:${parts.minute}`,
    publishedLabel: `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`,
    isRed: level === "A" || level === "B",
    isTop: false,
    tags: subjects
      .map((subject) => ({
        name: String(subject?.subject_name || subject?.name || "").trim(),
        code: "",
        stockCode: "",
        url: "",
      }))
      .filter((tag) => tag.name),
  };
}

async function fetchStarMarketItems(limit = 30) {
  const url = new URL(STAR_MARKET_CACHE_URL);
  url.searchParams.set("rn", String(limit));
  url.searchParams.set("lastTime", String(Math.floor(Date.now() / 1000)));
  url.searchParams.set("app", "stib");
  url.searchParams.set("channel", "100");
  url.searchParams.set("name", "telegraph");

  const payload = await fetchJsonWithRetry(
    url.toString(),
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        Referer: STAR_MARKET_TELEGRAPH_URL,
      },
    },
    2,
  );

  const rawItems = Array.isArray(payload?.data?.roll_data) ? payload.data.roll_data : [];
  const seenIds = new Set();
  const items = [];
  for (const raw of rawItems) {
    const item = normalizeStarMarketItem(raw);
    if (!item || seenIds.has(item.id)) {
      continue;
    }
    seenIds.add(item.id);
    items.push(item);
    if (items.length >= limit) {
      break;
    }
  }
  return items.sort((a, b) => b.timestamp - a.timestamp);
}

function normalizeJingjiGlobalItem(raw) {
  const title = cleanHtmlText(raw?.title || "");
  let timestamp = Number(raw?.updatetime);
  if (timestamp < 100000000000) {
    timestamp *= 1000;
  }
  if (!title || !Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  const parts = getDateParts(timestamp);
  const itemId = String(raw?.id || raw?.api || `${timestamp}-${title}`).trim();
  let articleUrl = String(raw?.url || JINGJI_GLOBAL_URL).trim();
  if (articleUrl.startsWith("//")) {
    articleUrl = `https:${articleUrl}`;
  } else if (articleUrl.startsWith("/")) {
    articleUrl = `https://m.21jingji.com${articleUrl}`;
  }

  const tags = String(raw?.keywords || "")
    .split(/[,，;；]/)
    .map((keyword) => ({
      name: keyword.trim(),
      code: "",
      stockCode: "",
      url: "",
    }))
    .filter((tag) => tag.name);

  return {
    id: `jingji-global-${itemId}`,
    title,
    summary: cleanHtmlText(raw?.description || ""),
    source: "21财经",
    url: articleUrl,
    imageUrl: normalizeImageUrl(raw?.listthumb || raw?.image || raw?.thumb || ""),
    imageAlt: title,
    timestamp,
    publishedAt: new Date(timestamp).toISOString(),
    publishedDate: `${parts.year}-${parts.month}-${parts.day}`,
    publishedTime: `${parts.hour}:${parts.minute}`,
    publishedLabel: `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`,
    isRed: false,
    isTop: false,
    tags,
  };
}

async function fetchJingjiGlobalItems(limit = 30) {
  const commonHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    Origin: "https://www.21jingji.com",
    Referer: JINGJI_GLOBAL_URL,
  };
  const authPayload = await fetchJsonWithRetry(
    JINGJI_AUTH_URL,
    { method: "POST", headers: commonHeaders },
    2,
  );
  const token = String(authPayload?.token || "").trim();
  if (!token) {
    throw new Error("21财经接口未返回授权令牌");
  }

  const pageCount = Math.min(4, Math.max(1, Math.ceil(limit / 20)));
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => {
      const url = new URL(JINGJI_GLOBAL_API_URL);
      url.searchParams.set("page", String(index + 1));
      url.searchParams.set("type", "json");
      return fetchJsonWithRetry(
        url.toString(),
        {
          method: "POST",
          headers: {
            ...commonHeaders,
            Authorization: token,
            "Content-Type": "application/json",
          },
        },
        2,
      );
    }),
  );

  const seenIds = new Set();
  const items = [];
  for (const raw of pages.flat()) {
    const item = normalizeJingjiGlobalItem(raw);
    if (!item || seenIds.has(item.id)) {
      continue;
    }
    seenIds.add(item.id);
    items.push(item);
  }
  return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
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
    sourceName: "证券时报网 / 界面新闻 / 风向旗参考快讯 / 科创板日报 / 21财经",
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
    Math.min(20, Number.parseInt(requestUrl.searchParams.get("pages") || "8", 10) || 8),
  );

  try {
    const [{ items: stcnItems, pagesFetched }, jiemianItems, kejiItems, starMarketItems, jingjiGlobalItems] = await Promise.all([
      fetchStcnItems(pages),
      fetchJiemianItems(3).catch(() => []),
      fetchKejiItems(30).catch(() => []),
      fetchStarMarketItems(30).catch(() => []),
      fetchJingjiGlobalItems(30).catch(() => []),
    ]);
    const items = [...stcnItems, ...jiemianItems, ...kejiItems, ...starMarketItems, ...jingjiGlobalItems].sort(
      (a, b) => b.timestamp - a.timestamp,
    );
    const payload = buildPayload(items, pagesFetched);
    payload.isLive = true;
    payload.isFallback = false;
    payload.jiemianArticleCount = jiemianItems.length;
    payload.kejiArticleCount = kejiItems.length;
    payload.starMarketArticleCount = starMarketItems.length;
    payload.jingjiGlobalArticleCount = jingjiGlobalItems.length;
    return jsonResponse(payload, 200);
  } catch (error) {
    return jsonResponse(
      {
        state: 0,
        msg: `Failed to fetch live news: ${String(error)}`,
      },
      502,
    );
  }
}
