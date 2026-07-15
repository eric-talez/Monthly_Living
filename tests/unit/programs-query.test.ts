import { describe, expect, it } from 'vitest';

import { PAGE_SIZE } from '@/modules/programs/constants';
import {
  computePagination,
  parseProgramListQuery,
  resolveCanonicalQuery,
  toCanonicalSearchParams,
} from '@/modules/programs/query';

describe('parseProgramListQuery — 기본값', () => {
  it('빈 입력은 featured/page 1/필터 null로 정규화한다', () => {
    expect(parseProgramListQuery({})).toEqual({
      country: null,
      destination: null,
      category: null,
      sort: 'featured',
      page: 1,
    });
    expect(parseProgramListQuery(undefined)).toEqual({
      country: null,
      destination: null,
      category: null,
      sort: 'featured',
      page: 1,
    });
  });
});

describe('parseProgramListQuery — sort allowlist', () => {
  it.each(['featured', 'price_asc', 'price_desc', 'rating'] as const)(
    '유효 sort %s를 유지한다',
    (sort) => {
      expect(parseProgramListQuery({ sort }).sort).toBe(sort);
    },
  );

  it('무효/부재 sort는 featured로 수렴한다', () => {
    expect(parseProgramListQuery({ sort: 'bogus' }).sort).toBe('featured');
    expect(parseProgramListQuery({ sort: '' }).sort).toBe('featured');
    expect(parseProgramListQuery({}).sort).toBe('featured');
  });
});

describe('parseProgramListQuery — page 위생', () => {
  it('유효 정수 page를 유지한다', () => {
    expect(parseProgramListQuery({ page: '5' }).page).toBe(5);
    expect(parseProgramListQuery({ page: '1000' }).page).toBe(1000);
  });

  it.each(['0', '-3', 'abc', '1.5', '', '99999', '1001'])(
    '비정상 page %s는 1로 정규화한다',
    (page) => {
      expect(parseProgramListQuery({ page }).page).toBe(1);
    },
  );
});

describe('parseProgramListQuery — 반복 parameter는 첫 값', () => {
  it('배열 입력에서 첫 값만 사용한다', () => {
    expect(parseProgramListQuery({ category: ['yoga', 'golf'] }).category).toBe('yoga');
    expect(parseProgramListQuery({ sort: ['price_asc', 'rating'] }).sort).toBe('price_asc');
    expect(parseProgramListQuery({ page: ['2', '3'] }).page).toBe(2);
    expect(parseProgramListQuery({ country: ['th', 'kr'] }).country).toBe('TH');
  });
});

describe('parseProgramListQuery — country 형식(대문자 alpha-2)', () => {
  it('alpha-2를 대문자화한다', () => {
    expect(parseProgramListQuery({ country: 'kr' }).country).toBe('KR');
    expect(parseProgramListQuery({ country: 'TH' }).country).toBe('TH');
  });

  it.each(['KOR', 'k', '1', '12', 'k1', 'kr ', ''])(
    '형식 오류 country %s는 제거된다(null)',
    (country) => {
      // 'kr '는 trim되어 KR이 되므로 별도 확인
      const value = parseProgramListQuery({ country }).country;
      if (country.trim().toUpperCase() === 'KR') {
        expect(value).toBe('KR');
      } else {
        expect(value).toBeNull();
      }
    },
  );
});

describe('parseProgramListQuery — destination/category slug 형식', () => {
  it('소문자 slug를 정규화한다', () => {
    expect(parseProgramListQuery({ destination: 'jeju' }).destination).toBe('jeju');
    expect(parseProgramListQuery({ category: 'Yoga-Pilates' }).category).toBe('yoga-pilates');
  });

  it.each(['yoga pilates', '한글', 'a_b', 'a'.repeat(65)])(
    '형식 오류 slug는 제거된다(null)',
    (slug) => {
      expect(parseProgramListQuery({ destination: slug }).destination).toBeNull();
      expect(parseProgramListQuery({ category: slug }).category).toBeNull();
    },
  );
});

describe('toCanonicalSearchParams — 기본값 생략', () => {
  it('기본 쿼리는 빈 문자열', () => {
    const q = parseProgramListQuery({});
    expect(toCanonicalSearchParams(q).toString()).toBe('');
  });

  it('featured/page 1은 생략하고 나머지는 포함한다', () => {
    const params = toCanonicalSearchParams({
      country: 'TH',
      destination: null,
      category: 'yoga',
      sort: 'price_asc',
      page: 2,
    });
    expect(params.get('country')).toBe('TH');
    expect(params.get('category')).toBe('yoga');
    expect(params.get('sort')).toBe('price_asc');
    expect(params.get('page')).toBe('2');
    expect(params.has('destination')).toBe(false);
  });

  it('sort=featured, page=1은 canonical에서 제거된다', () => {
    const params = toCanonicalSearchParams({
      country: null,
      destination: null,
      category: null,
      sort: 'featured',
      page: 1,
    });
    expect(params.toString()).toBe('');
  });
});

describe('resolveCanonicalQuery — redirect 판정', () => {
  it('이미 canonical이면 redirect 불필요', () => {
    expect(resolveCanonicalQuery({}).isCanonical).toBe(true);
    expect(resolveCanonicalQuery({ category: 'yoga' }).isCanonical).toBe(true);
    expect(resolveCanonicalQuery({ sort: 'price_asc', page: '2' }).isCanonical).toBe(true);
  });

  it('기본값 명시(sort=featured, page=1)는 canonical이 아니며 제거된다', () => {
    const featured = resolveCanonicalQuery({ sort: 'featured' });
    expect(featured.isCanonical).toBe(false);
    expect(featured.canonicalSearch).toBe('');

    const page1 = resolveCanonicalQuery({ page: '1' });
    expect(page1.isCanonical).toBe(false);
    expect(page1.canonicalSearch).toBe('');
  });

  it('무효 sort/page는 canonical이 아니며 정규화된다', () => {
    const badSort = resolveCanonicalQuery({ sort: 'bogus' });
    expect(badSort.isCanonical).toBe(false);
    expect(badSort.canonicalSearch).toBe('');

    const badPage = resolveCanonicalQuery({ page: '-5' });
    expect(badPage.isCanonical).toBe(false);
    expect(badPage.canonicalSearch).toBe('');
  });

  it('반복 parameter는 canonical이 아니며 첫 값만 남긴다', () => {
    const dup = resolveCanonicalQuery({ category: ['yoga', 'golf'] });
    expect(dup.isCanonical).toBe(false);
    expect(dup.canonicalSearch).toBe('category=yoga');
  });

  it('형식 오류 필터는 제거된다', () => {
    const badCountry = resolveCanonicalQuery({ country: 'KOR' });
    expect(badCountry.isCanonical).toBe(false);
    expect(badCountry.canonicalSearch).toBe('');
  });

  it('알려지지 않은 key(utm 등)는 보존한다', () => {
    const utm = resolveCanonicalQuery({ utm_source: 'x' });
    expect(utm.isCanonical).toBe(true);
    expect(utm.canonicalSearch).toBe('utm_source=x');
  });

  it('알려지지 않은 key는 보존하면서 기본값 param은 제거한다', () => {
    const mixed = resolveCanonicalQuery({ utm_source: 'x', page: '1' });
    expect(mixed.isCanonical).toBe(false);
    const params = new URLSearchParams(mixed.canonicalSearch);
    expect(params.get('utm_source')).toBe('x');
    expect(params.has('page')).toBe(false);
  });

  it('순서만 다른 입력은 canonical로 간주(redirect loop 방지)', () => {
    const reordered = resolveCanonicalQuery({ sort: 'price_asc', country: 'TH' });
    expect(reordered.isCanonical).toBe(true);
  });
});

describe('computePagination — 빈 결과 단일 계약', () => {
  it('total 0이면 totalPages 0, page 1, skip 0', () => {
    expect(computePagination(0, 3)).toEqual({
      page: 1,
      pageSize: PAGE_SIZE,
      total: 0,
      totalPages: 0,
      skip: 0,
      take: PAGE_SIZE,
    });
  });

  it('total>0이면 ceil로 totalPages 계산', () => {
    expect(computePagination(13, 1).totalPages).toBe(2);
    expect(computePagination(12, 1).totalPages).toBe(1);
    expect(computePagination(25, 2)).toMatchObject({
      totalPages: 3,
      skip: PAGE_SIZE,
      take: PAGE_SIZE,
    });
  });

  it('page > totalPages여도 clamp하지 않고 그 page의 skip을 사용한다(빈 items는 service가 반환)', () => {
    const p = computePagination(12, 5);
    expect(p.totalPages).toBe(1);
    expect(p.page).toBe(5);
    expect(p.skip).toBe(4 * PAGE_SIZE);
  });
});
