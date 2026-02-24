module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
  cron: {
    enabled: true,
    tasks: {
      [env('DEVTO_SYNC_CRON', '0 * * * *')]: async ({ strapi }) => {
        try {
          // Check the toggle in Strapi admin (DevTo Settings single type)
          const settings = await strapi.documents('api::devto-setting.devto-setting').findFirst();
          if (!settings || !settings.syncEnabled) return;

          const { syncArticles } = require('../src/api/devto/services/devto');
          await syncArticles();
        } catch (error) {
          strapi.log.error(`[DevTo] Cron sync failed: ${error.message}`);
        }
      },
    },
  },
});
