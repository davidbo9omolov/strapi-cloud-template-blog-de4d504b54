'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const mime = require('mime-types');

const DEVTO_API = 'https://dev.to/api';

async function fetchArticlesPage(page = 1, perPage = 20) {
  const response = await fetch(`${DEVTO_API}/articles/latest?per_page=${perPage}&page=${page}`);
  if (!response.ok) {
    throw new Error(`[DevTo] Failed to fetch articles page ${page}: ${response.status}`);
  }
  return response.json();
}

async function fetchArticleById(id) {
  const response = await fetch(`${DEVTO_API}/articles/${id}`);
  if (!response.ok) {
    throw new Error(`[DevTo] Failed to fetch article ${id}: ${response.status}`);
  }
  return response.json();
}

async function downloadAndUploadImage(imageUrl, name) {
  if (!imageUrl) return null;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      strapi.log.warn(`[DevTo] Failed to download image: ${imageUrl}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = path.extname(new URL(imageUrl).pathname).split('?')[0] || '.jpg';
    const fileName = `${name}${ext}`;
    const mimeType = mime.lookup(ext) || 'image/jpeg';

    const tmpPath = path.join(os.tmpdir(), fileName);
    await fs.writeFile(tmpPath, buffer);

    const [uploaded] = await strapi
      .plugin('upload')
      .service('upload')
      .upload({
        files: {
          filepath: tmpPath,
          originalFileName: fileName,
          size: buffer.length,
          mimetype: mimeType,
        },
        data: {
          fileInfo: {
            alternativeText: `Cover image for ${name}`,
            caption: name,
            name: name,
          },
        },
      });

    await fs.remove(tmpPath);

    return uploaded;
  } catch (error) {
    strapi.log.warn(`[DevTo] Image upload failed for ${name}: ${error.message}`);
    return null;
  }
}

const UNSPLASH_SOURCE = 'https://source.unsplash.com/1200x630';
const MIN_BODY_LENGTH = 150;
const FIRST_PERSON_TITLE_RE = /\b(I |I'[a-z]+|my |we |we'[a-z]+|our )\b/i;

function getPlainText(markdown) {
  // Strip markdown syntax, URLs, images, code blocks, HTML tags
  return markdown
    .replace(/```[\s\S]*?```/g, '')       // code blocks
    .replace(/`[^`]*`/g, '')              // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')  // links
    .replace(/https?:\/\/\S+/g, '')       // raw URLs
    .replace(/<[^>]+>/g, '')              // HTML tags
    .replace(/\{%[^%]*%\}/g, '')          // liquid tags
    .trim();
}

function validateArticle(article) {
  const body = article.body_markdown || '';
  const title = article.title || '';
  const plainText = getPlainText(body);

  if (plainText.length < MIN_BODY_LENGTH) {
    return { valid: false, reason: `too little text content (${plainText.length} chars, min ${MIN_BODY_LENGTH})` };
  }

  const alphanumeric = plainText.replace(/[^a-zA-Z0-9]/g, '').length;
  const ratio = alphanumeric / plainText.length;
  if (ratio < 0.4) {
    return { valid: false, reason: `too many non-text symbols (${Math.round(ratio * 100)}% alphanumeric)` };
  }

  if (FIRST_PERSON_TITLE_RE.test(title)) {
    return { valid: false, reason: `first-person title: "${title}"` };
  }

  return { valid: true };
}

function getFallbackImageUrl(tags) {
  // tags can be an array or a comma-separated string
  const tagList = Array.isArray(tags) ? tags : (tags || '').split(',').map((t) => t.trim());
  const keyword = (tagList.length > 0 && tagList[0] ? tagList[0] : 'technology').replace(/[^a-zA-Z0-9]/g, '');
  return `${UNSPLASH_SOURCE}/?${encodeURIComponent(keyword)}`;
}

function formatDate(dateString) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(dateString);
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const PER_PAGE = 20;
const MAX_PAGES = 5;

async function syncArticles() {
  strapi.log.info('[DevTo] Starting article sync...');

  let created = 0;
  let skipped = 0;
  let rejected = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const articles = await fetchArticlesPage(page, PER_PAGE);

    if (articles.length === 0) {
      strapi.log.info(`[DevTo] No more articles on page ${page}, stopping.`);
      break;
    }

    strapi.log.info(`[DevTo] Processing page ${page} (${articles.length} articles)...`);

    for (const summary of articles) {
    const existing = await strapi.documents('api::article.article').findMany({
      filters: { slug: summary.slug },
      limit: 1,
    });

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const full = await fetchArticleById(summary.id);

    const validation = validateArticle(full);
    if (!validation.valid) {
      rejected++;
      strapi.log.info(`[DevTo] Rejected "${full.title}" — ${validation.reason}`);
      continue;
    }

    const imageUrl = full.cover_image || getFallbackImageUrl(full.tag_list);
    const image = await downloadAndUploadImage(imageUrl, full.slug);

    const readTime = full.reading_time_minutes
      ? `${full.reading_time_minutes} min read`
      : '1 min read';

    await strapi.documents('api::article.article').create({
      data: {
        title: full.title,
        slug: full.slug,
        image: image ? image.id : null,
        date: formatDate(full.published_at),
        readTime,
        content: full.body_markdown || '',
        blocks: [
          {
            __component: 'shared.rich-text',
            body: full.body_markdown || '',
          },
        ],
      },
    });

    created++;
    strapi.log.info(`[DevTo] Created draft article: "${full.title}"`);
    }

    // If we got fewer results than requested, there are no more pages
    if (articles.length < PER_PAGE) break;
  }

  strapi.log.info(`[DevTo] Sync complete — created: ${created}, skipped: ${skipped}, rejected: ${rejected}`);
  return { created, skipped, rejected };
}

module.exports = { syncArticles };
