const JINGJI_GLOBAL_URL = "https://www.21jingji.com/channel/global/";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanHtmlText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArticleUrl(articleUrl) {
  let parsed;
  try {
    parsed = new URL(articleUrl);
  } catch {
    throw new Error("无效的21财经文章地址");
  }
  if (!['m.21jingji.com', 'www.21jingji.com'].includes(parsed.hostname)) {
    throw new Error("仅支持读取21财经文章");
  }
  if (!parsed.pathname.startsWith("/article/")) {
    throw new Error("无效的21财经文章路径");
  }
  return parsed.toString();
}

function extractImageUrl(imageTag) {
  for (const attribute of ["data-original", "data-src", "src"]) {
    const match = imageTag.match(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
    if (!match) {
      continue;
    }
    let imageUrl = decodeHtml(match[1]).trim().replace(/\s+/g, "");
    if (imageUrl.startsWith("//")) {
      imageUrl = `https:${imageUrl}`;
    } else if (imageUrl.startsWith("/")) {
      imageUrl = `https://m.21jingji.com${imageUrl}`;
    }
    if (/^https?:\/\//i.test(imageUrl)) {
      return imageUrl;
    }
  }
  return "";
}

function parseArticleBlocks(pageHtml) {
  const mainMatch = pageHtml.match(
    /<div\b[^>]*class=["'][^"']*\bmain_content\b[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/i,
  );
  if (!mainMatch) {
    return [];
  }

  const contentHtml = mainMatch[1];
  const blockPattern = /<(p|h[2-4]|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1\s*>|(<img\b[^>]*>)/gi;
  const imagePattern = /(<img\b[^>]*>)/gi;
  const blocks = [];
  const seenImages = new Set();

  const appendImage = (imageTag) => {
    const imageUrl = extractImageUrl(imageTag);
    if (!imageUrl || seenImages.has(imageUrl)) {
      return;
    }
    seenImages.add(imageUrl);
    blocks.push({ type: "image", url: imageUrl });
  };

  let blockMatch;
  while ((blockMatch = blockPattern.exec(contentHtml)) !== null) {
    if (blockMatch[3]) {
      appendImage(blockMatch[3]);
      continue;
    }
    const segments = String(blockMatch[2] || "").split(imagePattern);
    for (const segment of segments) {
      if (!segment) {
        continue;
      }
      if (/^<img\b/i.test(segment)) {
        appendImage(segment);
        continue;
      }
      const text = cleanHtmlText(segment);
      if (text) {
        blocks.push({ type: "text", text });
      }
    }
  }

  if (!blocks.length) {
    const fallbackText = cleanHtmlText(contentHtml);
    if (fallbackText) {
      blocks.push({ type: "text", text: fallbackText });
    }
  }
  return blocks;
}

async function fetchText(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), 30000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequestGet(context) {
  try {
    const requestUrl = new URL(context.request.url);
    const articleUrl = normalizeArticleUrl(requestUrl.searchParams.get("url") || "");
    const pageHtml = await fetchText(articleUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        Referer: JINGJI_GLOBAL_URL,
      },
    });

    const titleMatch = pageHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i);
    const dateMatch = pageHtml.match(
      /<div\b[^>]*class=["'][^"']*\bnewsDate\b[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/i,
    );
    const blocks = parseArticleBlocks(pageHtml);
    if (!blocks.length) {
      throw new Error("暂时无法读取该文章正文");
    }

    return jsonResponse({
      state: 1,
      title: cleanHtmlText(titleMatch?.[1] || "21财经文章"),
      source: "21财经",
      publishedLabel: cleanHtmlText(dateMatch?.[1] || ""),
      url: articleUrl,
      blocks,
    });
  } catch (error) {
    return jsonResponse({ state: 0, msg: String(error?.message || error) }, 400);
  }
}
