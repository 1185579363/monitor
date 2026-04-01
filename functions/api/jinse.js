const BASE_URL = "https://www.jinse.com.cn";
const LIVES_URL = `${BASE_URL}/lives`;

function absoluteUrl(url) {
  if (!url) {
    return LIVES_URL;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${BASE_URL}${url}`;
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

function extractItems(html, limit) {
  const blocks = html.match(/<div class="js-lives js-lives__item">[\s\S]*?<\/div>\s*<\/div>/g) || [];
  const items = [];

  for (const block of blocks) {
    const titleMatch = block.match(/<a[^>]*class="title"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<a[^>]*href="([^"]+)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/);
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

    items.push({
      id: idMatch ? idMatch[1] : href,
      title,
      summary,
      timeLabel,
      source: "金色财经",
      url: absoluteUrl(href),
    });

    if (items.length >= limit) {
      break;
    }
  }

  return items;
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
          Referer: LIVES_URL,
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
    Math.min(24, Number.parseInt(requestUrl.searchParams.get("limit") || "20", 10) || 20),
  );

  try {
    const html = await fetchHtmlWithRetry(LIVES_URL, 2);
    const items = extractItems(html, limit);
    return jsonResponse(
      {
        siteTitle: "金色财经快讯",
        sourceUrl: LIVES_URL,
        articleCount: items.length,
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
