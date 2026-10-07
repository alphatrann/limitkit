import {
  fixedWindow,
  gcra,
  InMemoryStore,
  leakyBucket,
  shapingLeakyBucket,
  slidingWindow,
  slidingWindowCounter,
  tokenBucket,
} from '../src';

const now = 1_000_000;

const algorithms: ReadonlyArray<readonly [string, () => any]> = [
  ['FixedWindow', () => fixedWindow({ limit: 5, window: 10 })],
  ['SlidingWindow', () => slidingWindow({ limit: 5, window: 10 })],
  [
    'SlidingWindowCounter',
    () => slidingWindowCounter({ limit: 5, window: 10 }),
  ],
  ['TokenBucket', () => tokenBucket({ capacity: 5, refillRate: 1 })],
  ['LeakyBucket', () => leakyBucket({ capacity: 5, leakRate: 1 })],
  [
    'ShapingLeakyBucket',
    () => shapingLeakyBucket({ capacity: 5, leakRate: 1 }),
  ],
  ['GCRA', () => gcra({ burst: 5, interval: 2 })],
];

describe.each(algorithms)('InMemoryStore.peek (%s)', (_name, make) => {
  it('creates no state for an unseen key', async () => {
    const store = new InMemoryStore();
    const algo = make();

    const peeked = await store.peek('k', algo, now);

    expect(peeked.allowed).toBe(true);
    expect((store as any).map.size).toBe(0);
  });

  it('reports exactly what the next consume would, without changing it', async () => {
    const store = new InMemoryStore();
    const algo = make();
    for (let i = 0; i < 3; i++) await store.consume('k', algo, now);

    const first = await store.peek('k', algo, now);
    const second = await store.peek('k', algo, now);
    const consumed = await store.consume('k', algo, now);

    expect(second).toEqual(first);
    expect(consumed).toEqual(first);
  });

  it('reports a rejection once the quota is spent, and stays rejected', async () => {
    const store = new InMemoryStore();
    const algo = make();
    for (let i = 0; i < 5; i++) await store.consume('k', algo, now);

    const first = await store.peek('k', algo, now);
    const second = await store.peek('k', algo, now);

    expect(first.allowed).toBe(false);
    expect(second).toEqual(first);
    expect(await store.consume('k', algo, now)).toEqual(first);
  });

  it('honors cost', async () => {
    const store = new InMemoryStore();
    const algo = make();
    await store.consume('k', algo, now, 3);

    expect((await store.peek('k', algo, now, 2)).allowed).toBe(true);
    expect((await store.peek('k', algo, now, 3)).allowed).toBe(false);
  });
});

describe('InMemoryStore.peek (SlidingWindow log)', () => {
  it('adds no entry and evicts nothing', async () => {
    const store = new InMemoryStore();
    const algo = slidingWindow({ limit: 5, window: 10 });
    await store.consume('k', algo, now, 2);
    const before = JSON.stringify((store as any).map.get('k'));

    await store.peek('k', algo, now + 1_000);
    await store.peek('k', algo, now + 60_000); // everything expired by then

    expect(JSON.stringify((store as any).map.get('k'))).toBe(before);
  });
});
