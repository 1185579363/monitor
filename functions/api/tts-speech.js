const TOKEN_REFRESH_BEFORE_EXPIRY = 3 * 60;
const EDGE_ENDPOINT_URL = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
const EDGE_SECRET =
  "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";

let tokenInfo = {
  endpoint: null,
  token: null,
  expiredAt: null,
};

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(),
    },
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeXmlText(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getSsml(text, voiceName, rate, pitch, volume, style) {
  return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="${voiceName}"><mstts:express-as style="${style}" styledegree="2.0" role="default"><prosody rate="${rate}" pitch="${pitch}" volume="${volume}">${escapeXmlText(text)}</prosody></mstts:express-as></voice></speak>`;
}

function splitText(text, maxChunkSize = 1500) {
  const chunks = [];
  const sentences = String(text).split(/[。！？\n]/);
  let current = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.length > maxChunkSize) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      for (let index = 0; index < trimmed.length; index += maxChunkSize) {
        chunks.push(trimmed.slice(index, index + maxChunkSize));
      }
      continue;
    }

    if ((current + trimmed).length > maxChunkSize) {
      if (current) {
        chunks.push(current.trim());
      }
      current = trimmed;
    } else {
      current += (current ? "。" : "") + trimmed;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

async function getVoice(
  text,
  voiceName = "zh-CN-XiaoxiaoNeural",
  rate = "+0%",
  pitch = "+0Hz",
  volume = "+0%",
  style = "newscast",
  outputFormat = "audio-24khz-48kbitrate-mono-mp3",
) {
  const cleanText = String(text || "").trim();
  if (!cleanText) {
    throw new Error("文本内容为空");
  }

  const chunks = cleanText.length <= 1500 ? [cleanText] : splitText(cleanText, 1500);
  if (chunks.length > 8) {
    throw new Error("朗读文本过长，请缩短后重试");
  }

  const audioChunks = [];
  for (let index = 0; index < chunks.length; index += 1) {
    if (index > 0) {
      await delay(300);
    }
    audioChunks.push(
      await getAudioChunk(chunks[index], voiceName, rate, pitch, volume, style, outputFormat),
    );
  }

  return concatByteArrays(audioChunks);
}

async function getAudioChunk(
  text,
  voiceName,
  rate,
  pitch,
  volume,
  style,
  outputFormat,
  maxRetries = 3,
) {
  const retryDelay = 500;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const endpoint = await getEndpoint();
      const response = await fetch(
        `https://${endpoint.r}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            Authorization: endpoint.t,
            "Content-Type": "application/ssml+xml",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0",
            "X-Microsoft-OutputFormat": outputFormat,
          },
          body: getSsml(text, voiceName, rate, pitch, volume, style),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
          await delay(retryDelay * (attempt + 1));
          continue;
        }
        throw new Error(`Edge TTS API错误: ${response.status} ${errorText}`);
      }

      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(`音频生成失败（已重试${maxRetries}次）: ${error.message}`);
      }
      await delay(retryDelay * (attempt + 1));
    }
  }

  throw new Error("音频生成失败");
}

function concatByteArrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function getEndpoint() {
  const now = Date.now() / 1000;
  if (tokenInfo.token && tokenInfo.expiredAt && now < tokenInfo.expiredAt - TOKEN_REFRESH_BEFORE_EXPIRY) {
    return tokenInfo.endpoint;
  }

  const clientId = crypto.randomUUID().replace(/-/g, "");
  const response = await fetch(EDGE_ENDPOINT_URL, {
    method: "POST",
    headers: {
      "Accept-Language": "zh-Hans",
      "X-ClientVersion": "4.0.530a 5fe1dc6c",
      "X-UserId": "0f04d16a175c411e",
      "X-HomeGeographicRegion": "zh-Hans-CN",
      "X-ClientTraceId": clientId,
      "X-MT-Signature": await sign(EDGE_ENDPOINT_URL),
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0",
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": "0",
      "Accept-Encoding": "gzip",
    },
  });

  if (!response.ok) {
    if (tokenInfo.token) {
      return tokenInfo.endpoint;
    }
    throw new Error(`获取Edge TTS endpoint失败: ${response.status}`);
  }

  const data = await response.json();
  const decodedJwt = JSON.parse(atob(data.t.split(".")[1]));
  tokenInfo = {
    endpoint: data,
    token: data.t,
    expiredAt: decodedJwt.exp,
  };
  return data;
}

async function sign(urlString) {
  const url = urlString.split("://")[1];
  const encodedUrl = encodeURIComponent(url);
  const uuid = crypto.randomUUID().replace(/-/g, "");
  const formattedDate = new Date().toUTCString().replace(/GMT/, "").trim().toLowerCase() + " gmt";
  const bytesToSign = `MSTranslatorAndroidApp${encodedUrl}${formattedDate}${uuid}`.toLowerCase();
  const secret = base64ToBytes(EDGE_SECRET);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(bytesToSign));
  return `MSTranslatorAndroidApp::${bytesToBase64(new Uint8Array(signature))}::${formattedDate}::${uuid}`;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function toSignedPercent(value, scale = 1) {
  const numberValue = Number.parseFloat(value);
  const safeValue = Number.isFinite(numberValue) ? numberValue : 0;
  const rounded = Math.round(safeValue * scale);
  return rounded >= 0 ? `+${rounded}%` : `${rounded}%`;
}

function toSignedHz(value) {
  const parsed = Number.parseInt(value, 10);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;
  return safeValue >= 0 ? `+${safeValue}Hz` : `${safeValue}Hz`;
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const speed = Number.parseFloat(body.speed ?? "1.25");
    const audio = await getVoice(
      body.input,
      body.voice || "zh-CN-XiaoxiaoNeural",
      toSignedPercent((Number.isFinite(speed) ? speed : 1.25) - 1, 100),
      toSignedHz(body.pitch || "0"),
      toSignedPercent(body.volume || "0", 100),
      body.style || "newscast",
    );

    return new Response(audio, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: "api_error",
          code: "edge_tts_error",
        },
      },
      500,
    );
  }
}
