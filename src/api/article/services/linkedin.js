'use strict';

const path = require('path');
const fs = require('fs');

const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest';
const LINKEDIN_VERSION = '202602';

function getConfig() {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;
  const blogBaseUrl = process.env.BLOG_BASE_URL;

  if (!accessToken || !personUrn) {
    return null;
  }

  return { accessToken, personUrn, blogBaseUrl };
}

// Unicode bold mapping for A-Z, a-z, 0-9
const BOLD_MAP = {};
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('').forEach((ch, i) => {
  const bold = '𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵';
  BOLD_MAP[ch] = [...bold][i];
});

function toBold(str) {
  return [...str].map((ch) => BOLD_MAP[ch] || ch).join('');
}

// Unicode italic mapping for A-Z, a-z
const ITALIC_MAP = {};
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').forEach((ch, i) => {
  const italic = '𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻';
  ITALIC_MAP[ch] = [...italic][i];
});

function toItalic(str) {
  return [...str].map((ch) => ITALIC_MAP[ch] || ch).join('');
}

// Unicode monospace mapping for A-Z, a-z, 0-9
const MONO_MAP = {};
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('').forEach((ch, i) => {
  const mono = '𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿';
  MONO_MAP[ch] = [...mono][i];
});

function toMono(str) {
  return [...str].map((ch) => MONO_MAP[ch] || ch).join('');
}

function convertTable(tableBlock) {
  const rows = tableBlock.trim().split('\n').filter((r) => !/^\s*\|[-:\s|]+\|\s*$/.test(r));
  if (rows.length === 0) return '';

  const parseRow = (row) => row.split('|').map((c) => c.trim()).filter(Boolean);
  const header = parseRow(rows[0]);
  const dataRows = rows.slice(1).map(parseRow);

  const lines = [];
  if (header.length > 0) {
    lines.push(toBold(header.join('  |  ')));
  }
  for (const row of dataRows) {
    lines.push(row.join('  |  '));
  }
  return lines.join('\n');
}

function markdownToLinkedIn(text) {
  if (!text) return '';

  let result = text;

  // Remove images
  result = result.replace(/!\[.*?\]\(.*?\)/g, '');

  // Convert links: [text](url) → text (url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // Convert tables before other processing
  result = result.replace(/((?:\|[^\n]+\|\n)+)/g, (match) => convertTable(match));

  // Convert code blocks to monospace unicode
  result = result.replace(/```(?:\w*)\n([\s\S]*?)```/g, (_, code) => {
    const lines = code.trimEnd().split('\n');
    return '\n' + lines.map((line) => '    ' + toMono(line)).join('\n') + '\n';
  });

  // Convert inline code to monospace
  result = result.replace(/`([^`]+)`/g, (_, code) => toMono(code));

  // Convert headers to bold
  result = result.replace(/^#{1,6}\s+(.+)$/gm, (_, heading) => '\n' + toBold(heading));

  // Convert bold+italic (***text*** or ___text___)
  result = result.replace(/\*{3}([^*]+)\*{3}/g, (_, t) => toBold(toItalic(t)));
  result = result.replace(/_{3}([^_]+)_{3}/g, (_, t) => toBold(toItalic(t)));

  // Convert bold (**text** or __text__)
  result = result.replace(/\*{2}([^*]+)\*{2}/g, (_, t) => toBold(t));
  result = result.replace(/_{2}([^_]+)_{2}/g, (_, t) => toBold(t));

  // Convert italic (*text* or _text_)
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, t) => toItalic(t));
  result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, (_, t) => toItalic(t));

  // Convert blockquotes
  result = result.replace(/^>\s+(.+)$/gm, '┃ $1');

  // Convert horizontal rules to line separator
  result = result.replace(/^-{3,}$/gm, '━━━━━━━━━━━━━━━━━━━━');

  // Bullet lists — keep as-is with proper dash
  result = result.replace(/^[-*+]\s+/gm, '• ');

  // Numbered lists — keep as-is
  result = result.replace(/^(\d+)\.\s+/gm, '$1. ');

  // Clean up excessive blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

const LINKEDIN_MAX_LENGTH = 3000;
const SITE_URL = 'https://www.davidbogomolov.com';

function buildReadMore(slug, blogBaseUrl) {
  const articleUrl = slug && blogBaseUrl
    ? `${blogBaseUrl.replace(/\/$/, '')}/blog/${slug}`
    : SITE_URL;
  return `\n\n━━━━━━━━━━━━━━━━━━━━\n📖 Read the full article: ${articleUrl}`;
}

function truncateToLimit(text, maxLen, readMore) {
  if (text.length <= maxLen) return text;

  const cutoff = maxLen - readMore.length;
  // Cut at the last paragraph break before the limit
  const lastBreak = text.lastIndexOf('\n\n', cutoff);
  const truncated = lastBreak > cutoff * 0.5 ? text.substring(0, lastBreak) : text.substring(0, cutoff);
  return truncated + readMore;
}

function buildHeaders(accessToken, extraHeaders = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'LinkedIn-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    ...extraHeaders,
  };
}

async function uploadImageToLinkedIn(accessToken, personUrn, imageUrl) {
  // Step 1: Initialize the upload
  const initResponse = await fetch(`${LINKEDIN_API_BASE}/images?action=initializeUpload`, {
    method: 'POST',
    headers: buildHeaders(accessToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: `urn:li:person:${personUrn}`,
      },
    }),
  });

  if (!initResponse.ok) {
    const err = await initResponse.text();
    strapi.log.error(`[LinkedIn] Image upload init failed ${initResponse.status}: ${err}`);
    return null;
  }

  const initData = await initResponse.json();
  const uploadUrl = initData.value.uploadUrl;
  const imageUrn = initData.value.image;

  // Step 2: Get the image binary
  let imageBuffer;
  if (imageUrl.startsWith('http')) {
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      strapi.log.error(`[LinkedIn] Failed to fetch image from ${imageUrl}`);
      return null;
    }
    imageBuffer = Buffer.from(await imgResponse.arrayBuffer());
  } else {
    // Local file — resolve from Strapi's public/uploads
    const localPath = path.join(strapi.dirs.static.public, imageUrl);
    if (!fs.existsSync(localPath)) {
      strapi.log.error(`[LinkedIn] Local image not found: ${localPath}`);
      return null;
    }
    imageBuffer = fs.readFileSync(localPath);
  }

  // Step 3: Upload the binary
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: imageBuffer,
  });

  if (!uploadResponse.ok) {
    const err = await uploadResponse.text();
    strapi.log.error(`[LinkedIn] Image binary upload failed ${uploadResponse.status}: ${err}`);
    return null;
  }

  strapi.log.info(`[LinkedIn] Image uploaded successfully: ${imageUrn}`);
  return imageUrn;
}

async function createPost({ title, content, slug, imageUrl }) {
  const config = getConfig();
  if (!config) {
    strapi.log.warn('[LinkedIn] Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_URN. Skipping post.');
    return null;
  }

  const { accessToken, personUrn, blogBaseUrl } = config;

  const formattedContent = markdownToLinkedIn(content);
  const fullCommentary = formattedContent
    ? `${toBold(title)}\n\n${formattedContent}`
    : toBold(title);
  const readMore = buildReadMore(slug, blogBaseUrl);
  const commentary = truncateToLimit(fullCommentary, LINKEDIN_MAX_LENGTH, readMore);

  strapi.log.info(`[LinkedIn] Commentary length: ${commentary.length}`);
  strapi.log.info(`[LinkedIn] Commentary first 500 chars: ${JSON.stringify(commentary.substring(0, 500))}`);

  const body = {
    author: `urn:li:person:${personUrn}`,
    commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
    },
    lifecycleState: 'PUBLISHED',
  };

  // Upload image to LinkedIn if available
  if (imageUrl) {
    try {
      const imageUrn = await uploadImageToLinkedIn(accessToken, personUrn, imageUrl);
      if (imageUrn) {
        body.content = {
          media: {
            id: imageUrn,
          },
        };
      }
    } catch (err) {
      strapi.log.error(`[LinkedIn] Image upload error: ${err.message}`);
    }
  }

  // Add article link if BLOG_BASE_URL is configured (without overriding image)
  if (blogBaseUrl && slug && !body.content) {
    const articleUrl = `${blogBaseUrl.replace(/\/$/, '')}/articles/${slug}`;
    body.content = {
      article: {
        source: articleUrl,
        title,
      },
    };
  }

  strapi.log.info(`[LinkedIn] Request body: ${JSON.stringify(body, null, 2)}`);

  try {
    const response = await fetch(`${LINKEDIN_API_BASE}/posts`, {
      method: 'POST',
      headers: buildHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 401) {
        strapi.log.error(
          '[LinkedIn] Access token expired or invalid (401). Visit /api/linkedin/auth to re-authenticate.'
        );
      } else {
        strapi.log.error(`[LinkedIn] API error ${response.status}: ${errorBody}`);
      }
      return null;
    }

    const postId = response.headers.get('x-restli-id');
    strapi.log.info(`[LinkedIn] Post created successfully. ID: ${postId || 'unknown'}`);
    return postId;
  } catch (error) {
    strapi.log.error(`[LinkedIn] Failed to create post: ${error.message}`);
    return null;
  }
}

module.exports = {
  createPost,
};
