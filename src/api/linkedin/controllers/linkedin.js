'use strict';

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const SCOPES = 'openid profile w_member_social';

module.exports = {
  async auth(ctx) {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) {
      return ctx.badRequest('LINKEDIN_CLIENT_ID is not set in .env');
    }

    const redirectUri = `${ctx.request.origin}/api/linkedin/callback`;
    const state = Math.random().toString(36).substring(2);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: SCOPES,
    });

    ctx.redirect(`${LINKEDIN_AUTH_URL}?${params.toString()}`);
  },

  async callback(ctx) {
    const { code, error, error_description } = ctx.query;

    if (error) {
      return ctx.badRequest(`LinkedIn OAuth error: ${error} - ${error_description}`);
    }

    if (!code) {
      return ctx.badRequest('Missing authorization code');
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return ctx.badRequest('LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET not set in .env');
    }

    const redirectUri = `${ctx.request.origin}/api/linkedin/callback`;

    try {
      const response = await fetch(LINKEDIN_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        strapi.log.error(`[LinkedIn] Token exchange failed: ${errorBody}`);
        return ctx.badRequest(`Token exchange failed: ${errorBody}`);
      }

      const data = await response.json();

      // Fetch the person URN using the userinfo endpoint
      let personUrn = '';
      try {
        const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
          },
        });

        if (profileResponse.ok) {
          const profile = await profileResponse.json();
          personUrn = profile.sub || '';
        }
      } catch (profileError) {
        strapi.log.warn(`[LinkedIn] Could not fetch profile: ${profileError.message}`);
      }

      const expiresInDays = Math.round(data.expires_in / 86400);

      ctx.body = {
        message: 'LinkedIn OAuth successful! Add these values to your .env file:',
        LINKEDIN_ACCESS_TOKEN: data.access_token,
        LINKEDIN_PERSON_URN: personUrn,
        token_type: data.token_type,
        expires_in_days: expiresInDays,
        note: `Token expires in ${expiresInDays} days. Visit /api/linkedin/auth to refresh.`,
      };
    } catch (err) {
      strapi.log.error(`[LinkedIn] OAuth callback error: ${err.message}`);
      return ctx.badRequest(`OAuth callback error: ${err.message}`);
    }
  },
};
