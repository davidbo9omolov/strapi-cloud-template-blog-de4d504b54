'use strict';

const { syncArticles } = require('../services/devto');

module.exports = {
  async sync(ctx) {
    try {
      const result = await syncArticles();
      ctx.body = {
        message: 'Dev.to sync completed',
        ...result,
      };
    } catch (error) {
      strapi.log.error(`[DevTo] Sync failed: ${error.message}`);
      ctx.badRequest(`Sync failed: ${error.message}`);
    }
  },
};
