import { describe, it, expect } from 'vitest';

describe('Pagination Stability & Keyset Cursor Verification', () => {
  interface Item {
    id: string;
    createdAt: Date;
    title: string;
  }

  // Create 50 distinct items with deterministic descending timestamps
  const mockItems: Item[] = Array.from({ length: 50 }, (_, i) => ({
    id: `item-${String(50 - i).padStart(3, '0')}`,
    createdAt: new Date(Date.now() - i * 1000),
    title: `Problem ${50 - i}`,
  }));

  function encodeCursor(item: Item): string {
    return Buffer.from(
      JSON.stringify({ id: item.id, createdAt: item.createdAt.toISOString() }),
      'utf8'
    ).toString('base64url');
  }

  function decodeCursor(cursor: string): { id: string; createdAt: string } {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  }

  function paginate(
    items: Item[],
    limit: number,
    cursor?: string
  ): { page: Item[]; nextCursor: string | null } {
    let filtered = items;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      const cursorDate = new Date(decoded.createdAt).getTime();
      filtered = items.filter((it) => {
        const itemDate = it.createdAt.getTime();
        return itemDate < cursorDate || (itemDate === cursorDate && it.id < decoded.id);
      });
    }

    const hasMore = filtered.length > limit;
    const page = hasMore ? filtered.slice(0, limit) : filtered;
    const last = page[page.length - 1];

    return {
      page,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }

  it.each([10, 20, 50])(
    'paginates 50 items cleanly with limit %i without duplicates or skips',
    (limit) => {
      const collected: Item[] = [];
      let currentCursor: string | undefined = undefined;
      let pagesCount = 0;

      do {
        pagesCount++;
        const res = paginate(mockItems, limit, currentCursor);
        expect(res.page.length).toBeLessThanOrEqual(limit);
        collected.push(...res.page);
        currentCursor = res.nextCursor ?? undefined;
      } while (currentCursor);

      // Total items gathered must be exactly 50
      expect(collected).toHaveLength(50);

      // All IDs must be unique
      const uniqueIds = new Set(collected.map((it) => it.id));
      expect(uniqueIds.size).toBe(50);

      // Expected pages count: 10 -> 5 pages, 20 -> 3 pages, 50 -> 1 page
      const expectedPages = Math.ceil(50 / limit);
      expect(pagesCount).toBe(expectedPages);
    }
  );
});
