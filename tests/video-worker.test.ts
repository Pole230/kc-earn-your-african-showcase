import { Readable } from 'stream';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processVideoWithClient } from '@/integrations/video/worker';

// Mocked supabase client factory
function createMockSupabase({ videoRowExists = true } = {}) {
  const videoRow = videoRowExists
    ? { id: 'vid1', user_id: 'user1', video_path: 'user1/123.mp4', thumbnail_path: null, status: 'processing' }
    : null;

  const updateMock = vi.fn(async (payload: any) => ({ error: null }));

  const fromFn = vi.fn((table: string) => {
    if (table === 'videos') {
      return {
        select: (_: string) => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: async () => ({ data: videoRow, error: videoRow ? null : { message: 'not found' } }),
          }),
        }),
        update: (_payload: any) => ({ eq: async () => ({ error: null }) }),
      };
    }
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    };
  });

  const uploadMock = vi.fn(async (_path: string, _file: any, _opts?: any) => ({ error: null }));
  const createSignedUrlMock = vi.fn(async (_path: string, _exp: number) => ({ data: { signedUrl: 'https://example.com/video' }, error: null }));

  const storage = {
    from: (_bucket: string) => ({
      createSignedUrl: createSignedUrlMock,
      upload: uploadMock,
    }),
  };

  const client: any = {
    from: fromFn,
    storage,
  };

  // expose spies for assertions
  return { client, spies: { fromFn, createSignedUrlMock, uploadMock, updateMock } };
}

describe('video worker - processVideoWithClient', () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
  });

  afterEach(() => {
    if (originalFetch) (globalThis as any).fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('publishes video and uploads thumbnail on success', async () => {
    const { client, spies } = createMockSupabase({ videoRowExists: true });

    // Mock fetch to return a readable stream
    (globalThis as any).fetch = vi.fn(async () => ({ ok: true, body: Readable.from(['dummy']) }));

    // Spy on client.from('videos').update
    const updateSpy = vi.fn(async (payload: any) => ({ error: null }));
    client.from = (table: string) => {
      if (table === 'videos') {
        return {
          select: (_: string) => ({
            eq: (_col: string, _val: string) => ({ maybeSingle: async () => ({ data: { id: 'vid1', user_id: 'user1', video_path: 'user1/123.mp4', thumbnail_path: null, status: 'processing' }, error: null }) }),
          }),
          update: (payload: any) => ({ eq: async () => ({ error: null, data: null }) }),
        };
      }
      return { update: (payload: any) => ({ eq: async () => ({ error: null }) }) };
    };

    await expect(processVideoWithClient(client as any, 'vid1')).resolves.toBeUndefined();

    // Assert createSignedUrl and upload were called
    expect(spies.createSignedUrlMock).toHaveBeenCalled();
    expect(spies.uploadMock).toHaveBeenCalled();
  });

  it('throws when video not found', async () => {
    const { client } = createMockSupabase({ videoRowExists: false });

    (globalThis as any).fetch = vi.fn(async () => ({ ok: true, body: Readable.from(['dummy']) }));

    await expect(processVideoWithClient(client as any, 'missing')).rejects.toBeDefined();
  });
});
