'use strict';
const bootstrap = require("./bootstrap");
const linkedinService = require("./api/article/services/linkedin");

module.exports = {
  register({ strapi }) {
    strapi.documents.use(async (context, next) => {
      const result = await next();

      if (
        context.uid === 'api::article.article' &&
        context.action === 'publish'
      ) {
        const documentId = context.params?.documentId;
        strapi.log.info(`[LinkedIn] Publish detected for article ${documentId}`);

        try {
          const article = await strapi.documents('api::article.article').findOne({
            documentId,
            populate: ['image'],
          });

          if (!article) {
            strapi.log.warn(`[LinkedIn] Could not find article ${documentId}`);
            return result;
          }

          strapi.log.info(`[LinkedIn] Found article: "${article.title}", content: "${(article.content || '').substring(0, 100)}..."`);

          let imageUrl = null;
          if (article.image?.url) {
            imageUrl = article.image.url.startsWith('http')
              ? article.image.url
              : `${process.env.BLOG_BASE_URL || ''}${article.image.url}`;
          }

          linkedinService.createPost({
            title: article.title,
            content: article.content || '',
            slug: article.slug,
            imageUrl,
          }).catch((err) => {
            strapi.log.error(`[LinkedIn] Unexpected error: ${err.message}`);
          });
        } catch (err) {
          strapi.log.error(`[LinkedIn] Error fetching article: ${err.message}`);
        }
      }

      return result;
    });
  },

  bootstrap,
};
