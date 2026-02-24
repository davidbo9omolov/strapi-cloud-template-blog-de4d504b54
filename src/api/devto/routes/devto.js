'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/devto/sync',
      handler: 'devto.sync',
      config: {
        auth: false,
      },
    },
  ],
};
