'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/linkedin/auth',
      handler: 'linkedin.auth',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/linkedin/callback',
      handler: 'linkedin.callback',
      config: {
        auth: false,
      },
    },
  ],
};
