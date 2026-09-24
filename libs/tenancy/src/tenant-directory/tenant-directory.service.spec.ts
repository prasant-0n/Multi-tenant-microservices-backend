import { TenantDirectory } from './tenant-directory.service';

describe('TenantDirectory', () => {
  let events: {
    subscribe: jest.Mock;
  };
  let directory: TenantDirectory;

  beforeEach(() => {
    events = {
      subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
    };
    directory = new TenantDirectory(events as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is empty until hydrated', () => {
    expect(directory.all()).toEqual([]);
    expect(directory.schemaOf('m1')).toBeUndefined();
  });

  it('learns entries from live tenant.created events', () => {
    directory.listen();
    const handler = events.subscribe.mock.calls.find(
      ([channel]) => channel === 'tenant.created',
    )?.[1];

    expect(typeof handler).toBe('function');
    handler({ tenantId: 't1', schema: 'tenant_x', name: 'X' });

    expect(directory.schemaOf('t1')).toBe('tenant_x');
    expect(directory.all()).toEqual([{ tenantId: 't1', schema: 'tenant_x' }]);
  });

  it('cold-syncs from the control plane', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 't1', schemaName: 'tenant_x' },
        { id: 't2', schemaName: 'tenant_y' },
      ],
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as any);

    await directory.sync('http://control');

    expect(directory.schemaOf('t1')).toBe('tenant_x');
    expect(directory.schemaOf('t2')).toBe('tenant_y');
  });

  it('tolerates an unreachable control plane', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('ECONNREFUSED');
    });

    await expect(directory.sync('http://control')).resolves.toBeUndefined();
    expect(directory.all()).toEqual([]);
  });

  it('pages through the whole tenant list when it exceeds one page', async () => {
    const page: Array<{ id: string; schemaName: string }> = Array.from({ length: 500 }, (_, i) => ({
      id: `t${i}`,
      schemaName: `tenant_${i}`,
    }));
    const calls: string[] = [];
    const fetchMock = jest.fn(async (input: unknown) => {
      const url = String(input);
      calls.push(url);
      const offset = Number(new URL(url).searchParams.get('offset'));
      const tail = offset === 0 ? page : [{ id: 't500', schemaName: 'tenant_500' }];
      return {
        ok: true,
        json: async () => tail,
      };
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as any);

    await directory.sync('http://control');

    expect(calls).toHaveLength(2);
    expect(directory.all()).toHaveLength(501);
    expect(directory.schemaOf('t0')).toBe('tenant_0');
    expect(directory.schemaOf('t500')).toBe('tenant_500');
  });
});
