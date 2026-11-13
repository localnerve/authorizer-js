import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { Authorizer } from '../lib/index.mjs';
import type { ApiResponse, AuthToken } from '../lib';

const authorizerConfig = {
  authorizerURL: 'http://localhost:8080',
  redirectURL: 'http://localhost:8080/app',
  // clientID: '3fab5e58-5693-46f2-8123-83db8133cd22',
  adminSecret: 'secret',
};

const testConfig = {
  email: 'test@test.com',
  webHookId: '',
  webHookUrl: 'https://webhook.site/c28a87c1-f061-44e0-9f7a-508bc554576f',
  userId: '',
  emailTemplateId: '',
  password: 'Test@123#',
  maginLinkLoginEmail: 'test_magic_link@test.com',
};

// Using etheral.email for email sink: https://ethereal.email/create
const authorizerENV = {
  ENV: 'production',
  DATABASE_URL: 'data.db',
  DATABASE_TYPE: 'sqlite',
  CUSTOM_ACCESS_TOKEN_SCRIPT:
    'function(user,tokenPayload){var data = tokenPayload;data.extra = {\'x-extra-id\': user.id};return data;}',
  DISABLE_PLAYGROUND: 'true',
  SMTP_HOST: 'smtp.ethereal.email',
  SMTP_PASSWORD: 'WncNxwVFqb6nBjKDQJ',
  SMTP_USERNAME: 'sydnee.lesch77@ethereal.email',
  LOG_LELVEL: 'debug',
  SMTP_PORT: '587',
  SENDER_EMAIL: 'test@authorizer.dev',
  ADMIN_SECRET: 'secret',
};

// const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const verificationRequests =
  'query {_verification_requests { verification_requests { id token email expires identifier } } }';

describe('Integration Tests - authorizer-js', { timeout: 500_000 }, () => {
  let container: StartedTestContainer;

  let authorizer: Authorizer;

  before(async () => {
    container = await new GenericContainer('localnerve/authorizer:latest')
      .withEnvironment(authorizerENV)
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp('/health', 8080).forStatusCode(200))
      .start();

    authorizerConfig.authorizerURL = `http://${container.getHost()}:${container.getMappedPort(
      8080,
    )}`;
    authorizerConfig.redirectURL = `http://${container.getHost()}:${container.getMappedPort(
      8080,
    )}/app`;
    console.log('Authorizer URL:', authorizerConfig.authorizerURL);
    authorizer = new Authorizer(authorizerConfig);
    // get metadata
    const metadataRes = await authorizer.getMetaData();
    // await sleep(50000);
    assert.notEqual(metadataRes?.data, undefined);
    if (metadataRes?.data?.client_id) {
      authorizer.config.clientID = metadataRes?.data?.client_id;
    }
  });

  after(async () => {
    await container.stop();
  });

  it('should signup with email verification enabled', async () => {
    const signupRes = await authorizer.signup({
      email: testConfig.email,
      password: testConfig.password,
      confirm_password: testConfig.password,
    });
    assert.notEqual(signupRes?.data, undefined);
    assert.equal(signupRes?.errors.length, 0);
    assert.notEqual(signupRes?.data?.message?.length, 0);
  });

  it('should verify email', async () => {
    const verificationRequestsRes = await authorizer.graphqlQuery({
      query: verificationRequests,
      variables: {},
      headers: {
        'x-authorizer-admin-secret': authorizerConfig.adminSecret,
      },
    });
    const requests =
      verificationRequestsRes?.data?._verification_requests
        .verification_requests;
    assert.notEqual(verificationRequestsRes?.data, undefined);
    assert.equal(verificationRequestsRes?.errors.length, 0);
    const item = requests.find(
      (i: { email: string }) => i.email === testConfig.email,
    );
    assert.notEqual(item, null);

    const verifyEmailRes = await authorizer.verifyEmail({ token: item.token });
    assert.notEqual(verifyEmailRes?.data, undefined);
    assert.equal(verifyEmailRes?.errors.length, 0);
    assert.ok((verifyEmailRes?.data?.access_token?.length ?? 0) > 0);
  });

  let loginRes: ApiResponse<AuthToken> | null;
  it('should log in successfully', async () => {
    loginRes = await authorizer.login({
      email: testConfig.email,
      password: testConfig.password,
      scope: ['openid', 'profile', 'email', 'offline_access'],
    });
    assert.notEqual(loginRes?.data, undefined);
    assert.equal(loginRes?.errors.length, 0);
    assert.notEqual(loginRes?.data?.access_token.length, 0);
    assert.notEqual(loginRes?.data?.refresh_token?.length, 0);
    assert.notEqual(loginRes?.data?.expires_in, 0);
    assert.notEqual(loginRes?.data?.id_token.length, 0);
  });

  it('should validate jwt token', async () => {
    const validateRes = await authorizer.validateJWTToken({
      token_type: 'access_token',
      token: loginRes?.data?.access_token || '',
    });
    assert.notEqual(validateRes?.data, undefined);
    assert.equal(validateRes?.errors.length, 0);
    assert.equal(validateRes?.data?.is_valid, true);
  });

  it('should update profile successfully', async () => {
    const updateProfileRes = await authorizer.updateProfile(
      {
        given_name: 'bob',
      },
      {
        Authorization: `Bearer ${loginRes?.data?.access_token}`,
      },
    );
    assert.notEqual(updateProfileRes?.data, undefined);
    assert.equal(updateProfileRes?.errors.length, 0);
  });

  it('should fetch profile successfully', async () => {
    const profileRes = await authorizer.getProfile({
      Authorization: `Bearer ${loginRes?.data?.access_token}`,
    });
    assert.notEqual(profileRes?.data, undefined);
    assert.equal(profileRes?.errors.length, 0);
    assert.ok(profileRes?.data?.given_name?.includes('bob'));
  });

  it('should get access_token using refresh_token', async () => {
    const tokenRes = await authorizer.getToken({
      grant_type: 'refresh_token',
      refresh_token: loginRes?.data?.refresh_token,
    });
    assert.notEqual(tokenRes?.data, undefined);
    assert.equal(tokenRes?.errors.length, 0);
    assert.notEqual(tokenRes?.data?.access_token.length, 0);
    if (loginRes && loginRes.data) {
      loginRes.data.access_token = tokenRes?.data?.access_token || '';
    }
  });

  it('should deactivate account', async () => {
    const deactivateRes = await authorizer.deactivateAccount({
      Authorization: `Bearer ${loginRes?.data?.access_token}`,
    });
    assert.notEqual(deactivateRes?.data, undefined);
    assert.equal(deactivateRes?.errors.length, 0);
  });

  it('should throw error while accessing profile after deactivation', async () => {
    const resp = await authorizer.getProfile({
      Authorization: `Bearer ${loginRes?.data?.access_token}`,
    });
    assert.equal(resp?.data, undefined);
    assert.equal(resp?.errors.length, 1);
  });

  describe('magic link login', () => {
    it('should login with magic link', async () => {
      const magicLinkLoginRes = await authorizer.magicLinkLogin({
        email: testConfig.maginLinkLoginEmail,
      });
      assert.notEqual(magicLinkLoginRes?.data, undefined);
      assert.equal(magicLinkLoginRes?.errors.length, 0);
    });
    it('should verify email', async () => {
      const verificationRequestsRes = await authorizer.graphqlQuery({
        query: verificationRequests,
        headers: {
          'x-authorizer-admin-secret': authorizerConfig.adminSecret,
        },
      });
      const requests =
        verificationRequestsRes?.data?._verification_requests
          .verification_requests;
      const item = requests.find(
        (i: { email: string }) => i.email === testConfig.maginLinkLoginEmail,
      );
      assert.notEqual(item, null);
      const verifyEmailRes = await authorizer.verifyEmail({
        token: item.token,
      });
      assert.notEqual(verifyEmailRes?.data, undefined);
      assert.equal(verifyEmailRes?.errors.length, 0);
      assert.ok(
        verifyEmailRes?.data?.user?.signup_methods?.includes(
          'magic_link_login',
        ),
      );
    });
  });
});
