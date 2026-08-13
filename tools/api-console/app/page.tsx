'use client';

import { FormEvent, useMemo, useState } from 'react';

type Endpoint = {
  group: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  name: string;
  auth?: 'required' | 'optional';
  access: string;
  body?: Record<string, unknown>;
};

type TestResult = {
  name: string;
  method: string;
  path: string;
  status?: number;
  passed: boolean;
  detail: string;
  responseBody?: string;
};

const endpoints: Endpoint[] = [
  {
    group: 'System',
    method: 'GET',
    path: '/api',
    name: 'Health check',
    access: 'Public',
  },
  {
    group: 'Auth',
    method: 'POST',
    path: '/api/auth/login',
    name: 'Login',
    access: 'Public',
    body: { username: 'admin', password: '' },
  },
  {
    group: 'Auth',
    method: 'GET',
    path: '/api/auth/me',
    name: 'Current user',
    auth: 'required',
    access: 'Authenticated',
  },
  {
    group: 'Auth',
    method: 'POST',
    path: '/api/auth/logout',
    name: 'Logout',
    auth: 'required',
    access: 'Authenticated',
  },
  {
    group: 'Users',
    method: 'GET',
    path: '/api/users',
    name: 'List users',
    auth: 'required',
    access: 'Admin only',
  },
  {
    group: 'Users',
    method: 'GET',
    path: '/api/users/:username',
    name: 'Get user',
    auth: 'required',
    access: 'Authenticated · private fields for self/admin',
  },
  {
    group: 'Users',
    method: 'POST',
    path: '/api/users',
    name: 'Create user',
    auth: 'optional',
    access: 'Optional token · public only when REGISTRATION_MODE=OPEN',
    body: {
      username: 'tester',
      email: 'tester@example.com',
      phone: '13912345678',
      password: 'Test12345',
      role: 'user',
    },
  },
  {
    group: 'Users',
    method: 'PATCH',
    path: '/api/users/:username',
    name: 'Update user',
    auth: 'required',
    access: 'Self or admin',
    body: {
      email: 'tester-new@example.com',
      oldPassword: 'CurrentPass123',
      password: 'NewPass12345',
    },
  },
  {
    group: 'Users',
    method: 'DELETE',
    path: '/api/users/:username',
    name: 'Delete user',
    auth: 'required',
    access: 'Admin only · cannot delete self',
  },
  {
    group: 'Posts',
    method: 'POST',
    path: '/api/posts',
    name: 'Create post',
    auth: 'required',
    access: 'Editor or admin',
    body: {
      title: 'DreamCMS test post',
      content: '# Hello DreamCMS\nAPI Console generated content.',
      summary: 'API test',
      status: 'draft',
      tags: ['NestJS', 'DreamCMS'],
    },
  },
  {
    group: 'Posts',
    method: 'GET',
    path: '/api/posts?page=1&pageSize=10&sort=latest',
    name: 'List public posts',
    access: 'Public · published posts only',
  },
  {
    group: 'Posts',
    method: 'PATCH',
    path: '/api/posts/tag/:oldTag/rename/:newTag',
    name: 'Rename tag',
    auth: 'required',
    access: 'Admin only',
  },
  {
    group: 'Posts',
    method: 'DELETE',
    path: '/api/posts/tag/:tag',
    name: 'Delete tag',
    auth: 'required',
    access: 'Admin only',
  },
  {
    group: 'Posts',
    method: 'GET',
    path: '/api/posts/manage?page=1&pageSize=10',
    name: 'Manage posts',
    auth: 'required',
    access: 'Admin or editor · supports status filtering',
  },
  {
    group: 'Posts',
    method: 'GET',
    path: '/api/posts/tag/DreamCMS?page=1&pageSize=10&sort=latest',
    name: 'List posts by tag',
    access: 'Public · published posts only',
  },
  {
    group: 'Posts',
    method: 'GET',
    path: '/api/posts/tags',
    name: 'List all tags',
    access: 'Public',
  },
  {
    group: 'Posts',
    method: 'GET',
    path: '/api/posts/get/:identifier',
    name: 'Get post',
    auth: 'optional',
    access: 'Optional token · published public · draft author/admin',
  },
  {
    group: 'Posts',
    method: 'PATCH',
    path: '/api/posts/:identifier',
    name: 'Update post',
    auth: 'required',
    access: 'Owner editor or admin · authorId admin only',
    body: {
      title: 'Updated title',
      summary: 'Updated summary',
      status: 'published',
      tags: ['DreamCMS', 'Updated'],
    },
  },
  {
    group: 'Posts',
    method: 'POST',
    path: '/api/posts/:identifier/alias',
    name: 'Create alias',
    auth: 'required',
    access: 'Author or admin · alias cannot start with 0d',
    body: { alias: 'hello-dreamcms' },
  },
  {
    group: 'Posts',
    method: 'GET',
    path: '/api/posts/:identifier/aliases',
    name: 'List aliases',
    auth: 'required',
    access: 'Owner editor or admin',
  },
  {
    group: 'Posts',
    method: 'PATCH',
    path: '/api/posts/:identifier/alias/:oldAlias/rename/:newAlias',
    name: 'Rename alias',
    auth: 'required',
    access: 'Owner editor or admin',
  },
  {
    group: 'Posts',
    method: 'DELETE',
    path: '/api/posts/:identifier/alias/:alias',
    name: 'Delete alias',
    auth: 'required',
    access: 'Owner editor or admin',
  },
  {
    group: 'Posts',
    method: 'DELETE',
    path: '/api/posts/:identifier',
    name: 'Trash post',
    auth: 'required',
    access: 'Owner editor or admin',
  },
  {
    group: 'Posts',
    method: 'PATCH',
    path: '/api/posts/:identifier/restore',
    name: 'Restore post',
    auth: 'required',
    access: 'Owner editor or admin',
  },
  {
    group: 'Posts',
    method: 'DELETE',
    path: '/api/posts/:identifier/permanent',
    name: 'Delete post permanently',
    auth: 'required',
    access: 'Owner editor or admin · irreversible',
  },
];

const groups = ['System', 'Auth', 'Users', 'Posts'];

export default function Home() {
  const [selected, setSelected] = useState(1);
  const endpoint = endpoints[selected];
  const [path, setPath] = useState(endpoint.path);
  const [body, setBody] = useState(
    JSON.stringify(endpoint.body ?? {}, null, 2),
  );
  const [token, setToken] = useState('');
  const [response, setResponse] = useState(
    'Select an endpoint and send a request.',
  );
  const [status, setStatus] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<
    Array<{ method: string; path: string; status: number; ms: number }>
  >([]);
  const [testUsername, setTestUsername] = useState('admin');
  const [testPassword, setTestPassword] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testMode, setTestMode] = useState<'functional' | 'permission' | null>(
    null,
  );

  const statusTone = useMemo(
    () =>
      !status ? 'idle' : status < 300 ? 'ok' : status < 500 ? 'warn' : 'bad',
    [status],
  );

  function choose(index: number) {
    const next = endpoints[index];
    setSelected(index);
    setPath(next.path);
    setBody(JSON.stringify(next.body ?? {}, null, 2));
    setStatus(null);
    setDuration(null);
    setResponse('Ready to send.');
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    const start = performance.now();
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (endpoint.auth && token) headers.Authorization = `Bearer ${token}`;
      const hasBody = endpoint.method === 'POST' || endpoint.method === 'PATCH';
      if (hasBody) headers['Content-Type'] = 'application/json';

      const result = await fetch(`/backend${path}`, {
        method: endpoint.method,
        headers,
        body: hasBody ? body : undefined,
      });
      const elapsed = Math.round(performance.now() - start);
      const text = await result.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* plain text response */
      }
      setStatus(result.status);
      setDuration(elapsed);
      setResponse(
        typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2),
      );
      setHistory((items) =>
        [
          { method: endpoint.method, path, status: result.status, ms: elapsed },
          ...items,
        ].slice(0, 8),
      );

      if (
        path === '/api/auth/login' &&
        result.ok &&
        typeof parsed === 'object' &&
        parsed
      ) {
        const accessToken = (parsed as { data?: { accessToken?: string } }).data
          ?.accessToken;
        if (accessToken) setToken(accessToken);
      }
      if (path === '/api/auth/logout' && result.ok) setToken('');
    } catch (error) {
      setStatus(0);
      setDuration(Math.round(performance.now() - start));
      setResponse(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function runFunctionalTests() {
    if (!testUsername.trim() || !testPassword) {
      setTestResults([
        {
          name: 'Test configuration',
          method: '—',
          path: '—',
          passed: false,
          detail: 'Enter an administrator username and password.',
        },
      ]);
      return;
    }

    setTestRunning(true);
    setTestMode('functional');
    setTestResults([]);
    const results: TestResult[] = [];
    const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const username = `web_${runId}`.slice(0, 32);
    const email = `${username}@example.com`;
    const updatedEmail = `${username}_new@example.com`;
    const alias = `web-test-${runId}`;
    const renamedAlias = `web-renamed-${runId}`;
    const tagName = `WebTag${runId}`;
    const renamedTag = `WebRenamedTag${runId}`;
    let adminToken = '';
    let publicId = '';

    const addResult = (item: TestResult) => {
      results.push(item);
      setTestResults([...results]);
    };

    async function check(
      name: string,
      method: Endpoint['method'],
      path: string,
      expectedStatus: number,
      options: {
        auth?: boolean;
        token?: string;
        body?: Record<string, unknown>;
      } = {},
    ) {
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        const requestToken = options.token ?? (options.auth ? adminToken : '');
        if (requestToken) headers.Authorization = `Bearer ${requestToken}`;
        if (options.body) headers['Content-Type'] = 'application/json';
        const response = await fetch(`/backend${path}`, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const text = await response.text();
        let payload: unknown = text;
        try {
          payload = JSON.parse(text);
        } catch {
          /* keep text */
        }
        const passed = response.status === expectedStatus;
        addResult({
          name,
          method,
          path,
          status: response.status,
          passed,
          detail: `Expected HTTP ${expectedStatus}, received HTTP ${response.status}`,
          responseBody:
            typeof payload === 'string'
              ? payload || '(empty response body)'
              : JSON.stringify(payload, null, 2),
        });
        return { response, payload };
      } catch (error) {
        addResult({
          name,
          method,
          path,
          passed: false,
          detail: error instanceof Error ? error.message : 'Request failed',
          responseBody: '(request did not receive a response)',
        });
        return null;
      }
    }

    try {
      await check('Health check', 'GET', '/api', 200);
      const login = await check('Admin login', 'POST', '/api/auth/login', 200, {
        body: { username: testUsername.trim(), password: testPassword },
      });
      if (
        login?.response.ok &&
        typeof login.payload === 'object' &&
        login.payload
      ) {
        adminToken =
          (login.payload as { data?: { accessToken?: string } }).data
            ?.accessToken ?? '';
        setToken(adminToken);
      }

      if (!adminToken) {
        addResult({
          name: 'Dependent API tests',
          method: '—',
          path: '—',
          passed: false,
          detail:
            'Login did not return an access token; authenticated tests were skipped.',
        });
        return;
      }

      await check('Current user', 'GET', '/api/auth/me', 200, { auth: true });
      await check('List users', 'GET', '/api/users', 200, { auth: true });
      await check(
        'List public posts',
        'GET',
        '/api/posts?page=1&pageSize=5&sort=latest',
        200,
      );
      await check(
        'Manage post pagination',
        'GET',
        '/api/posts/manage?page=1&pageSize=5',
        200,
        { auth: true },
      );
      await check(
        'Get administrator',
        'GET',
        `/api/users/${encodeURIComponent(testUsername.trim())}`,
        200,
        { auth: true },
      );
      await check('Create test user', 'POST', '/api/users', 201, {
        auth: true,
        body: { username, email, password: 'WebTest123!', role: 'user' },
      });
      await check('Get test user', 'GET', `/api/users/${username}`, 200, {
        auth: true,
      });
      await check('Update test user', 'PATCH', `/api/users/${username}`, 200, {
        auth: true,
        body: { email: updatedEmail },
      });

      const post = await check('Create draft post', 'POST', '/api/posts', 201, {
        auth: true,
        body: {
          title: `Web API test ${runId}`,
          content: 'Created by the DreamCMS one-click API test.',
          summary: 'Browser API test',
          status: 'draft',
          tags: [tagName, 'DreamCMS'],
        },
      });
      if (
        post?.response.ok &&
        typeof post.payload === 'object' &&
        post.payload
      ) {
        publicId =
          (post.payload as { data?: { publicId?: string } }).data?.publicId ??
          '';
      }

      if (publicId) {
        const publish = await check(
          'Publish draft post',
          'PATCH',
          `/api/posts/${publicId}`,
          200,
          { auth: true, body: { status: 'published' } },
        );
        const firstPublishedAt =
          publish?.response.ok &&
          typeof publish.payload === 'object' &&
          publish.payload
            ? ((publish.payload as { data?: { publishedAt?: string | null } })
                .data?.publishedAt ?? null)
            : null;
        addResult({
          name: 'draft → published sets publishedAt',
          method: 'PATCH',
          path: `/api/posts/${publicId}`,
          passed: Boolean(firstPublishedAt),
          detail: firstPublishedAt
            ? `publishedAt was set to ${firstPublishedAt}`
            : 'publishedAt should be a timestamp after publishing',
          responseBody: firstPublishedAt ?? 'null',
        });

        const unpublish = await check(
          'Return published post to draft',
          'PATCH',
          `/api/posts/${publicId}`,
          200,
          { auth: true, body: { status: 'draft' } },
        );
        const draftPublishedAt =
          unpublish?.response.ok &&
          typeof unpublish.payload === 'object' &&
          unpublish.payload
            ? (unpublish.payload as { data?: { publishedAt?: string | null } })
                .data?.publishedAt
            : undefined;
        addResult({
          name: 'published → draft clears publishedAt',
          method: 'PATCH',
          path: `/api/posts/${publicId}`,
          passed: draftPublishedAt === null,
          detail:
            draftPublishedAt === null
              ? 'publishedAt was cleared'
              : 'publishedAt should be null after returning to draft',
          responseBody: JSON.stringify(
            { publishedAt: draftPublishedAt },
            null,
            2,
          ),
        });

        const republish = await check(
          'Publish draft post again',
          'PATCH',
          `/api/posts/${publicId}`,
          200,
          { auth: true, body: { status: 'published' } },
        );
        const restoredPublishedAt =
          republish?.response.ok &&
          typeof republish.payload === 'object' &&
          republish.payload
            ? ((
                republish.payload as {
                  data?: { publishedAt?: string | null };
                }
              ).data?.publishedAt ?? null)
            : null;
        addResult({
          name: 'Republishing sets publishedAt again',
          method: 'PATCH',
          path: `/api/posts/${publicId}`,
          passed:
            Boolean(restoredPublishedAt) &&
            (!firstPublishedAt ||
              new Date(restoredPublishedAt!).getTime() >=
                new Date(firstPublishedAt).getTime()),
          detail: restoredPublishedAt
            ? `publishedAt was set to ${restoredPublishedAt}`
            : 'publishedAt should be set after republishing',
          responseBody: JSON.stringify(
            { firstPublishedAt, republishedAt: restoredPublishedAt },
            null,
            2,
          ),
        });

        await check(
          'List posts by new test tag',
          'GET',
          `/api/posts/tag/${encodeURIComponent(tagName)}?page=1&pageSize=5&sort=latest`,
          200,
        );
        const allTagsBeforeRename = await check(
          'List all tags before rename',
          'GET',
          '/api/posts/tags',
          200,
        );
        const tagsBeforeRename =
          allTagsBeforeRename?.response.ok &&
          typeof allTagsBeforeRename.payload === 'object' &&
          allTagsBeforeRename.payload
            ? (allTagsBeforeRename.payload as { data?: string[] }).data
            : undefined;
        addResult({
          name: 'All-tags endpoint contains created tag',
          method: 'GET',
          path: '/api/posts/tags',
          passed: Boolean(tagsBeforeRename?.includes(tagName)),
          detail: `Expected tag ${tagName} in the all-tags response`,
          responseBody: JSON.stringify(allTagsBeforeRename?.payload, null, 2),
        });
        await check(
          'Rename tag',
          'PATCH',
          `/api/posts/tag/${encodeURIComponent(tagName)}/rename/${encodeURIComponent(renamedTag)}`,
          200,
          { auth: true },
        );
        const renamedTagPosts = await check(
          'List posts by renamed tag',
          'GET',
          `/api/posts/tag/${encodeURIComponent(renamedTag)}?page=1&pageSize=5&sort=latest`,
          200,
        );
        const renamedTagTotal =
          renamedTagPosts?.response.ok &&
          typeof renamedTagPosts.payload === 'object' &&
          renamedTagPosts.payload
            ? (
                renamedTagPosts.payload as {
                  pagination?: { total?: number };
                }
              ).pagination?.total
            : undefined;
        addResult({
          name: 'Renamed tag keeps its post relation',
          method: 'GET',
          path: `/api/posts/tag/${renamedTag}`,
          passed: typeof renamedTagTotal === 'number' && renamedTagTotal >= 1,
          detail: `Expected at least 1 post, received ${renamedTagTotal ?? 'unknown'}`,
          responseBody:
            renamedTagPosts && typeof renamedTagPosts.payload !== 'string'
              ? JSON.stringify(renamedTagPosts.payload, null, 2)
              : String(renamedTagPosts?.payload ?? ''),
        });
        await check(
          'Delete renamed tag',
          'DELETE',
          `/api/posts/tag/${encodeURIComponent(renamedTag)}`,
          200,
          { auth: true },
        );
        const allTagsAfterDelete = await check(
          'List all tags after delete',
          'GET',
          '/api/posts/tags',
          200,
        );
        const tagsAfterDelete =
          allTagsAfterDelete?.response.ok &&
          typeof allTagsAfterDelete.payload === 'object' &&
          allTagsAfterDelete.payload
            ? (allTagsAfterDelete.payload as { data?: string[] }).data
            : undefined;
        addResult({
          name: 'Deleted tag is absent from all-tags endpoint',
          method: 'GET',
          path: '/api/posts/tags',
          passed: Boolean(
            tagsAfterDelete && !tagsAfterDelete.includes(renamedTag),
          ),
          detail: `Expected tag ${renamedTag} to be absent`,
          responseBody: JSON.stringify(allTagsAfterDelete?.payload, null, 2),
        });
        const deletedTagPosts = await check(
          'Deleted tag has no posts',
          'GET',
          `/api/posts/tag/${encodeURIComponent(renamedTag)}?page=1&pageSize=5&sort=latest`,
          200,
        );
        const deletedTagTotal =
          deletedTagPosts?.response.ok &&
          typeof deletedTagPosts.payload === 'object' &&
          deletedTagPosts.payload
            ? (
                deletedTagPosts.payload as {
                  pagination?: { total?: number };
                }
              ).pagination?.total
            : undefined;
        addResult({
          name: 'Deleting tag removes post relations',
          method: 'GET',
          path: `/api/posts/tag/${renamedTag}`,
          passed: deletedTagTotal === 0,
          detail: `Expected 0 posts, received ${deletedTagTotal ?? 'unknown'}`,
          responseBody:
            deletedTagPosts && typeof deletedTagPosts.payload !== 'string'
              ? JSON.stringify(deletedTagPosts.payload, null, 2)
              : String(deletedTagPosts?.payload ?? ''),
        });

        const update = await check(
          'Update published post fields',
          'PATCH',
          `/api/posts/${publicId}`,
          200,
          {
            auth: true,
            body: {
              title: `Web API updated ${runId}`,
              summary: 'Updated by the one-click API test',
              status: 'published',
              tags: ['APITestUpdated', 'apitestupdated', 'DreamCMS'],
            },
          },
        );
        if (
          update?.response.ok &&
          typeof update.payload === 'object' &&
          update.payload
        ) {
          const data = (
            update.payload as {
              data?: { publishedAt?: string | null; tags?: string[] };
            }
          ).data;
          if (
            !data?.publishedAt ||
            data.tags?.filter((item) => item.toLowerCase() === 'apitestupdated')
              .length !== 1
          ) {
            addResult({
              name: 'Validate update response',
              method: 'PATCH',
              path: `/api/posts/${publicId}`,
              passed: false,
              detail:
                'publishedAt was not set or duplicate tags were not removed.',
            });
          }
        }
        await check(
          'Get post with token',
          'GET',
          `/api/posts/get/${publicId}`,
          200,
          { auth: true },
        );
        await check(
          'Create post alias',
          'POST',
          `/api/posts/${publicId}/alias`,
          201,
          {
            auth: true,
            body: { alias },
          },
        );
        await check(
          'List post aliases',
          'GET',
          `/api/posts/${publicId}/aliases`,
          200,
          { auth: true },
        );
        await check(
          'Rename post alias',
          'PATCH',
          `/api/posts/${publicId}/alias/${alias}/rename/${renamedAlias}`,
          200,
          { auth: true },
        );
        await check(
          'Get post through renamed alias',
          'GET',
          `/api/posts/get/${renamedAlias}`,
          200,
        );
        await check(
          'Delete post alias',
          'DELETE',
          `/api/posts/${publicId}/alias/${renamedAlias}`,
          200,
          { auth: true },
        );
        await check(
          'Deleted alias is no longer available',
          'GET',
          `/api/posts/get/${renamedAlias}`,
          404,
        );
        await check(
          'List posts by tag',
          'GET',
          '/api/posts/tag/DreamCMS?page=1&pageSize=5&sort=latest',
          200,
        );
        await check(
          'Trash test post',
          'DELETE',
          `/api/posts/${publicId}`,
          200,
          { auth: true },
        );
        await check(
          'Restore test post',
          'PATCH',
          `/api/posts/${publicId}/restore`,
          200,
          { auth: true },
        );
        const restoredPost = await check(
          'Read restored post',
          'GET',
          `/api/posts/get/${publicId}`,
          200,
          { auth: true },
        );
        const publishedAtAfterRestore =
          restoredPost?.response.ok &&
          typeof restoredPost.payload === 'object' &&
          restoredPost.payload
            ? ((
                restoredPost.payload as {
                  data?: { publishedAt?: string | null };
                }
              ).data?.publishedAt ?? null)
            : null;
        addResult({
          name: 'Restore preserves publishedAt',
          method: 'GET',
          path: `/api/posts/get/${publicId}`,
          passed:
            Boolean(restoredPublishedAt) &&
            publishedAtAfterRestore === restoredPublishedAt,
          detail:
            publishedAtAfterRestore === restoredPublishedAt
              ? 'publishedAt was preserved after trash and restore'
              : 'publishedAt changed while the post was in the trash',
          responseBody: JSON.stringify(
            {
              beforeTrash: restoredPublishedAt,
              afterRestore: publishedAtAfterRestore,
            },
            null,
            2,
          ),
        });
        await check(
          'Reject permanent delete after restore',
          'DELETE',
          `/api/posts/${publicId}/permanent`,
          404,
          { auth: true },
        );
        await check(
          'Trash test post again',
          'DELETE',
          `/api/posts/${publicId}`,
          200,
          { auth: true },
        );
        await check(
          'Delete trashed post permanently',
          'DELETE',
          `/api/posts/${publicId}/permanent`,
          200,
          { auth: true },
        );
      } else {
        addResult({
          name: 'Post read and alias tests',
          method: '—',
          path: '/api/posts/get/:identifier',
          passed: false,
          detail:
            'Post creation did not return a publicId; dependent tests were skipped.',
        });
      }

      await check('Delete test user', 'DELETE', `/api/users/${username}`, 200, {
        auth: true,
      });
      await check('Logout', 'POST', '/api/auth/logout', 201, { auth: true });
      await check('Reject token after logout', 'GET', '/api/auth/me', 401, {
        auth: true,
      });
      setToken('');
    } finally {
      setTestRunning(false);
    }
  }

  async function runPermissionTests() {
    if (!testUsername.trim() || !testPassword) {
      setTestMode('permission');
      setTestResults([
        {
          name: 'Test configuration',
          method: '—',
          path: '—',
          passed: false,
          detail: 'Enter an administrator username and password.',
        },
      ]);
      return;
    }

    setTestRunning(true);
    setTestMode('permission');
    setTestResults([]);
    const results: TestResult[] = [];
    const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const username = `permission_${runId}`.slice(0, 32);
    const email = `${username}@example.com`;
    const forbiddenAlias = `permission-alias-${runId}`;
    const permissionTag = `PermissionTag${runId}`;
    const renamedPermissionTag = `PermissionRenamed${runId}`;
    let adminToken = '';
    let userToken = '';
    let publicId = '';

    const addResult = (item: TestResult) => {
      results.push(item);
      setTestResults([...results]);
    };

    async function check(
      name: string,
      method: Endpoint['method'],
      path: string,
      expectedStatus: number,
      options: {
        token?: string;
        body?: Record<string, unknown>;
      } = {},
    ) {
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (options.token) headers.Authorization = `Bearer ${options.token}`;
        if (options.body) headers['Content-Type'] = 'application/json';
        const response = await fetch(`/backend${path}`, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const text = await response.text();
        let payload: unknown = text;
        try {
          payload = JSON.parse(text);
        } catch {
          /* keep text */
        }
        const passed = response.status === expectedStatus;
        addResult({
          name,
          method,
          path,
          status: response.status,
          passed,
          detail: `Expected HTTP ${expectedStatus}, received HTTP ${response.status}`,
          responseBody:
            typeof payload === 'string'
              ? payload || '(empty response body)'
              : JSON.stringify(payload, null, 2),
        });
        return { response, payload };
      } catch (error) {
        addResult({
          name,
          method,
          path,
          passed: false,
          detail: error instanceof Error ? error.message : 'Request failed',
          responseBody: '(request did not receive a response)',
        });
        return null;
      }
    }

    try {
      await check('Guest can list public posts', 'GET', '/api/posts', 200);
      await check('Guest can list all tags', 'GET', '/api/posts/tags', 200);
      await check('Guest cannot manage posts', 'GET', '/api/posts/manage', 401);
      await check('Guest cannot create posts', 'POST', '/api/posts', 401, {
        body: { title: 'Guest post', content: 'Rejected' },
      });

      const adminLogin = await check(
        'Admin login for permission fixtures',
        'POST',
        '/api/auth/login',
        200,
        { body: { username: testUsername.trim(), password: testPassword } },
      );
      if (
        adminLogin?.response.ok &&
        typeof adminLogin.payload === 'object' &&
        adminLogin.payload
      ) {
        adminToken =
          (adminLogin.payload as { data?: { accessToken?: string } }).data
            ?.accessToken ?? '';
      }
      if (!adminToken) {
        addResult({
          name: 'Permission fixtures',
          method: '—',
          path: '—',
          passed: false,
          detail: 'Admin login did not return an access token.',
        });
        return;
      }

      await check('Create permission test user', 'POST', '/api/users', 201, {
        token: adminToken,
        body: { username, email, password: 'WebTest123!', role: 'user' },
      });
      const userLogin = await check(
        'Permission test user login',
        'POST',
        '/api/auth/login',
        200,
        { body: { username, password: 'WebTest123!' } },
      );
      if (
        userLogin?.response.ok &&
        typeof userLogin.payload === 'object' &&
        userLogin.payload
      ) {
        userToken =
          (userLogin.payload as { data?: { accessToken?: string } }).data
            ?.accessToken ?? '';
      }

      const post = await check(
        'Create permission test post',
        'POST',
        '/api/posts',
        201,
        {
          token: adminToken,
          body: {
            title: `Permission test ${runId}`,
            content: 'Temporary published post for permission checks.',
            status: 'published',
            tags: [permissionTag],
          },
        },
      );
      if (
        post?.response.ok &&
        typeof post.payload === 'object' &&
        post.payload
      ) {
        publicId =
          (post.payload as { data?: { publicId?: string } }).data?.publicId ??
          '';
      }
      if (!publicId || !userToken) {
        addResult({
          name: 'Post permission checks',
          method: '—',
          path: '—',
          passed: false,
          detail:
            'Unable to create the temporary post or obtain the user token.',
        });
        return;
      }

      await check(
        'Guest can read published post',
        'GET',
        `/api/posts/get/${publicId}`,
        200,
      );
      await check(
        'User can read published post',
        'GET',
        `/api/posts/get/${publicId}`,
        200,
        { token: userToken },
      );
      await check('User can list all tags', 'GET', '/api/posts/tags', 200, {
        token: userToken,
      });
      await check(
        'Guest can list posts by tag',
        'GET',
        `/api/posts/tag/${permissionTag}`,
        200,
      );

      const protectedRequests: Array<{
        name: string;
        method: Endpoint['method'];
        path: string;
        body?: Record<string, unknown>;
      }> = [
        {
          name: 'manage posts',
          method: 'GET',
          path: '/api/posts/manage',
        },
        {
          name: 'create posts',
          method: 'POST',
          path: '/api/posts',
          body: { title: 'Forbidden post', content: 'Rejected' },
        },
        {
          name: 'update posts',
          method: 'PATCH',
          path: `/api/posts/${publicId}`,
          body: { title: 'Forbidden update' },
        },
        {
          name: 'create aliases',
          method: 'POST',
          path: `/api/posts/${publicId}/alias`,
          body: { alias: forbiddenAlias },
        },
        {
          name: 'list aliases',
          method: 'GET',
          path: `/api/posts/${publicId}/aliases`,
        },
        {
          name: 'rename aliases',
          method: 'PATCH',
          path: `/api/posts/${publicId}/alias/old/rename/new`,
        },
        {
          name: 'delete aliases',
          method: 'DELETE',
          path: `/api/posts/${publicId}/alias/old`,
        },
        {
          name: 'trash posts',
          method: 'DELETE',
          path: `/api/posts/${publicId}`,
        },
        {
          name: 'restore posts',
          method: 'PATCH',
          path: `/api/posts/${publicId}/restore`,
        },
        {
          name: 'permanently delete posts',
          method: 'DELETE',
          path: `/api/posts/${publicId}/permanent`,
        },
        {
          name: 'rename tags',
          method: 'PATCH',
          path: `/api/posts/tag/${permissionTag}/rename/${renamedPermissionTag}`,
        },
        {
          name: 'delete tags',
          method: 'DELETE',
          path: `/api/posts/tag/${permissionTag}`,
        },
      ];

      for (const item of protectedRequests) {
        await check(`Guest cannot ${item.name}`, item.method, item.path, 401, {
          body: item.body,
        });
        await check(`User cannot ${item.name}`, item.method, item.path, 403, {
          token: userToken,
          body: item.body,
        });
      }

      await check(
        'Admin deletes permission test tag',
        'DELETE',
        `/api/posts/tag/${permissionTag}`,
        200,
        { token: adminToken },
      );

      await check(
        'Delete permission test post',
        'DELETE',
        `/api/posts/${publicId}`,
        200,
        { token: adminToken },
      );
      await check(
        'Permanently remove permission test post',
        'DELETE',
        `/api/posts/${publicId}/permanent`,
        200,
        { token: adminToken },
      );
      publicId = '';
      await check(
        'Delete permission test user',
        'DELETE',
        `/api/users/${username}`,
        200,
        { token: adminToken },
      );
    } finally {
      setTestRunning(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">D</span>
          <div>
            <strong>DreamCMS</strong>
            <small>API Console</small>
          </div>
        </div>
        <div className="environment">
          <span className="pulse" /> Development <code>localhost:3000</code>
        </div>
        <div className={`token-state ${token ? 'active' : ''}`}>
          <span>JWT</span>
          {token ? 'Token ready' : 'Not authenticated'}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="side-title">
            Endpoints <span>{endpoints.length}</span>
          </div>
          {groups.map((group) => (
            <section key={group} className="endpoint-group">
              <h2>{group}</h2>
              {endpoints.map(
                (item, index) =>
                  item.group === group && (
                    <button
                      key={item.path + item.method}
                      className={
                        selected === index ? 'endpoint selected' : 'endpoint'
                      }
                      onClick={() => choose(index)}
                    >
                      <span className={`method ${item.method.toLowerCase()}`}>
                        {item.method}
                      </span>
                      <span>{item.name}</span>
                      {item.auth && (
                        <i
                          title={
                            item.auth === 'required'
                              ? 'Token required'
                              : 'Token optional'
                          }
                        >
                          {item.auth === 'required' ? '◆' : '◇'}
                        </i>
                      )}
                    </button>
                  ),
              )}
            </section>
          ))}
        </aside>

        <section className="request-panel">
          <div className="eyebrow">
            {endpoint.group} / {endpoint.name}
          </div>
          <h1>Request builder</h1>
          <p className="lead">
            Edit the path and payload, then send it directly to your local
            DreamCMS API.
          </p>

          <form onSubmit={send}>
            <label>Endpoint</label>
            <div className="url-row">
              <span className={`method large ${endpoint.method.toLowerCase()}`}>
                {endpoint.method}
              </span>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                spellCheck={false}
              />
              <button disabled={loading}>
                {loading ? 'Sending…' : 'Send request'}
                <b>↗</b>
              </button>
            </div>

            {endpoint.auth && (
              <div className="field">
                <div className="label-line">
                  <label>Bearer token · {endpoint.auth}</label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setToken('')}
                  >
                    Clear
                  </button>
                </div>
                <input
                  className="token-input"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={
                    endpoint.auth === 'required'
                      ? 'Required — login first or paste an access token'
                      : 'Optional — leave empty to test as guest'
                  }
                  spellCheck={false}
                />
              </div>
            )}

            {(endpoint.method === 'POST' || endpoint.method === 'PATCH') && (
              <div className="field">
                <div className="label-line">
                  <label>JSON body</label>
                  <span>application/json</span>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  spellCheck={false}
                />
              </div>
            )}
          </form>

          <div className="tips">
            <strong>Access · {endpoint.access}</strong>
            <p>
              Replace <code>:username</code> or <code>:identifier</code> in the
              endpoint field with a real value before sending. User registration
              is public only when <code>REGISTRATION_MODE=OPEN</code>.
            </p>
          </div>
        </section>

        <aside className="response-panel">
          <div className="response-head">
            <div>
              <span>Response</span>
              <h2>Server output</h2>
            </div>
            <div className={`status ${statusTone}`}>
              {status === null ? '—' : status === 0 ? 'ERR' : status}
              {duration !== null && <small>{duration} ms</small>}
            </div>
          </div>
          <pre>{response}</pre>
          <div className="history">
            <div className="history-title">
              Recent requests{' '}
              <button onClick={() => setHistory([])}>Clear</button>
            </div>
            {history.length === 0 ? (
              <p>No requests yet.</p>
            ) : (
              history.map((item, index) => (
                <div className="history-row" key={`${item.path}-${index}`}>
                  <span
                    className={`dot ${item.status < 300 ? 'success' : 'failure'}`}
                  />
                  <b>{item.method}</b>
                  <code>{item.path}</code>
                  <small>
                    {item.status} · {item.ms}ms
                  </small>
                </div>
              ))
            )}
          </div>

          <section className="test-suite">
            <div className="suite-heading">
              <div>
                <span>Automated suite</span>
                <h2>
                  {testMode === 'permission'
                    ? 'Permission tests'
                    : 'Functional tests'}
                </h2>
              </div>
              <strong>
                {testResults.filter((item) => item.passed).length}/
                {testResults.length || endpoints.length}
              </strong>
            </div>
            <p>
              Functional tests validate complete API workflows. Permission tests
              separately verify guest and user access. Temporary users and posts
              are permanently removed afterward.
            </p>
            <div className="test-credentials">
              <input
                value={testUsername}
                onChange={(event) => setTestUsername(event.target.value)}
                placeholder="Admin username"
                autoComplete="username"
              />
              <input
                type="password"
                value={testPassword}
                onChange={(event) => setTestPassword(event.target.value)}
                placeholder="Admin password"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={runFunctionalTests}
                disabled={testRunning}
              >
                {testRunning && testMode === 'functional'
                  ? 'Testing…'
                  : 'Run functional tests'}
              </button>
              <button
                type="button"
                onClick={runPermissionTests}
                disabled={testRunning}
              >
                {testRunning && testMode === 'permission'
                  ? 'Testing…'
                  : 'Run permission tests'}
              </button>
            </div>
            {testResults.length > 0 && (
              <div className="test-results">
                {testResults.map((item, index) => (
                  <div
                    className={`test-result ${item.passed ? 'pass' : 'fail'}`}
                    key={`${item.name}-${index}`}
                  >
                    <span>{item.passed ? '✓' : '×'}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <code>
                        {item.method} {item.path}
                      </code>
                      <small>
                        {item.status ? `HTTP ${item.status} · ` : ''}
                        {item.detail}
                      </small>
                      {item.responseBody && (
                        <details className="test-response" open={!item.passed}>
                          <summary>Response body</summary>
                          <pre>{item.responseBody}</pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
