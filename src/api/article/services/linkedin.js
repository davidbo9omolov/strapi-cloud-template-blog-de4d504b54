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

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/>\s+/g, '')
    .replace(/[-*+]\s+/g, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

  const plainContent = stripMarkdown(content);
  const commentary = plainContent
    ? `${title}\n\n${plainContent}`
    : title;

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
