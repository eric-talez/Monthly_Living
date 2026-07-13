/**
 * 개발·스테이징 seed — idempotent (unique key 기준 upsert, 재실행 시 수렴).
 * 실행: pnpm db:seed
 * (Prisma 7.8 실측: `migrate reset`은 generate·seed를 자동 실행하지 않는다 —
 *  dev 대상 reset 후 seed는 scripts/db-reset.ts가 명시적으로 실행한다)
 *
 * 주의:
 * - 이미지 URL은 개발용 placeholder(picsum), production 전 교체 필요 (README).
 * - 전문가/프로그램의 평점·완료 수 집계값은 Review/Booking 행 없이 채운
 *   "표시·추천 개발용 가정치"다 — Phase 5에서 실제 데이터 기반 재계산으로 대체한다.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { config as loadDotenv } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client';
import { categorySeeds } from './seed-data/categories';
import { destinationSeeds } from './seed-data/destinations';
import { exchangeRateSeeds } from './seed-data/exchange-rates';
import { expertSeeds, type Tier } from './seed-data/experts';
import { platformSettingSeeds } from './seed-data/platform-settings';
import { TEST_PASSWORD, travelerProfileSeed, userSeeds } from './seed-data/users';

loadDotenv({ path: ['.env.local', '.env'], quiet: true });

if (!process.env.DATABASE_URL) {
  console.error('[seed] DATABASE_URL이 설정되어 있지 않습니다 (.env.example 참고)');
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
console.log(`[seed] target host=${url.hostname} database=${url.pathname.replace(/^\//, '')}`);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// 통화별 tier 가격 (minor units — KRW/VND 0-decimal, THB는 satang)
const TIER_PRICE: Record<'KRW' | 'THB' | 'VND', Record<Tier, number>> = {
  KRW: { low: 350_000, mid: 800_000, high: 1_800_000 },
  THB: { low: 900_00 * 10, mid: 2_200_00 * 10, high: 4_800_00 * 10 }, // 9,000/22,000/48,000 THB
  VND: { low: 6_000_000, mid: 14_000_000, high: 30_000_000 },
};

const PUBLISHED_AT = new Date('2026-06-15T00:00:00Z');

async function main() {
  // 1) 카테고리
  for (const c of categorySeeds) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: { ...c, active: true },
      update: {
        nameKo: c.nameKo,
        nameEn: c.nameEn,
        descriptionKo: c.descriptionKo,
        icon: c.icon,
        sortOrder: c.sortOrder,
        active: true,
      },
    });
  }

  // 2) 지역
  for (const d of destinationSeeds) {
    await prisma.destination.upsert({
      where: { slug: d.slug },
      create: { ...d, active: true },
      update: { ...d, active: true },
    });
  }
  const destinations = new Map((await prisma.destination.findMany()).map((d) => [d.slug, d]));
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c]));

  // 3) 테스트 계정 (traveler/admin) — 비밀번호는 문서화된 테스트용
  const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 12);
  for (const u of userSeeds) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: { ...u, passwordHash, emailVerified: PUBLISHED_AT },
      update: { role: u.role, name: u.name, fullName: u.fullName, passwordHash },
    });
  }
  const traveler = await prisma.user.findUniqueOrThrow({ where: { email: 'traveler@test.com' } });
  await prisma.travelerProfile.upsert({
    where: { userId: traveler.id },
    create: { userId: traveler.id, ...travelerProfileSeed },
    update: { ...travelerProfileSeed },
  });

  // 4) 전문가 20명 (user + profile + serviceAreas)
  const profileIdBySlug = new Map<string, string>();
  for (const [i, e] of expertSeeds.entries()) {
    const approved = e.verificationStatus === 'APPROVED';
    const user = await prisma.user.upsert({
      where: { email: e.email },
      create: {
        email: e.email,
        role: 'EXPERT',
        name: e.name,
        fullName: e.fullName,
        passwordHash: e.hasPassword ? passwordHash : null,
        preferredLanguage: e.languages[0] === 'ko' ? 'ko' : 'en',
        emailVerified: PUBLISHED_AT,
        timezone: destinations.get(e.baseCitySlug)!.timezone,
      },
      update: {
        role: 'EXPERT',
        name: e.name,
        fullName: e.fullName,
        passwordHash: e.hasPassword ? passwordHash : null,
      },
    });

    // 표시·추천 개발용 가정치 (index 기반 결정적 값)
    const metrics = approved
      ? {
          responseRate: 88 + (i % 12),
          responseTimeMinutes: 20 + (i % 6) * 25,
          averageRating: (4.4 + (i % 6) * 0.1).toFixed(2),
          reviewCount: 8 + i * 3,
          completedBookingCount: 12 + i * 4,
        }
      : {
          responseRate: null,
          responseTimeMinutes: null,
          averageRating: null,
          reviewCount: 0,
          completedBookingCount: 0,
        };

    const profileData = {
      displayName: e.displayName,
      bio: e.bio,
      specialties: e.specialties,
      languages: e.languages,
      yearsOfExperience: e.yearsOfExperience,
      baseDestinationId: destinations.get(e.baseCitySlug)!.id,
      verificationStatus: e.verificationStatus,
      identityVerified: approved,
      credentialVerified: approved,
      profilePublished: approved,
      verifiedAt: approved ? PUBLISHED_AT : null,
      ...metrics,
    } as const;

    const profile = await prisma.expertProfile.upsert({
      where: { slug: e.slug },
      create: { userId: user.id, slug: e.slug, ...profileData },
      update: { ...profileData },
    });
    profileIdBySlug.set(e.slug, profile.id);

    for (const areaSlug of e.serviceAreaSlugs) {
      await prisma.expertServiceArea.upsert({
        where: {
          expertId_destinationId: {
            expertId: profile.id,
            destinationId: destinations.get(areaSlug)!.id,
          },
        },
        create: { expertId: profile.id, destinationId: destinations.get(areaSlug)!.id },
        update: {},
      });
    }
  }

  // 5) 프로그램 40개 + 미디어
  let programCount = 0;
  for (const [i, e] of expertSeeds.entries()) {
    const approved = e.verificationStatus === 'APPROVED';
    const dest = destinations.get(e.baseCitySlug)!;
    for (const [j, p] of e.programs.entries()) {
      const slug = `${e.slug}-${p.slugSuffix}`;
      const currency = dest.currency as 'KRW' | 'THB' | 'VND';
      const data = {
        expertId: profileIdBySlug.get(e.slug)!,
        destinationId: dest.id,
        categoryId: categories.get(p.categorySlug)!.id,
        title: p.title,
        shortDescription: p.short,
        fullDescription: p.full,
        programType: p.programType,
        isOnline: p.isOnline ?? false,
        bookingType: p.bookingType,
        durationDays: p.durationDays,
        sessionCount: p.sessionCount,
        maxParticipants: p.maxParticipants,
        languages: e.languages,
        includes: p.includes,
        excludes: p.excludes ?? [],
        requirements: p.requirements ?? [],
        meetingPoint: p.meetingPoint ?? null,
        cancellationPolicy:
          '시작 14일 전까지 전액 환불, 7일 전까지 50% 환불, 이후 환불 불가. 세부 조건은 예약 시 계약 내용에 고정됩니다.',
        basePrice: TIER_PRICE[currency][p.tier],
        currency,
        petFriendly: p.petFriendly ?? false,
        childFriendly: p.childFriendly ?? false,
        accommodationIncluded: p.accommodationIncluded ?? false,
        transportIncluded: p.transportIncluded ?? false,
        status: approved ? ('PUBLISHED' as const) : ('DRAFT' as const),
        featured: p.featured ?? false,
        publishedAt: approved ? PUBLISHED_AT : null,
        // 표시·추천 개발용 가정치 (Review 행 없음 — Phase 5에서 실제 재계산)
        averageRating: approved ? (4.3 + ((i + j) % 7) * 0.1).toFixed(2) : null,
        reviewCount: approved ? 3 + ((i * 2 + j) % 12) : 0,
      };

      const program = await prisma.program.upsert({
        where: { slug },
        create: { slug, ...data },
        update: { ...data },
      });
      programCount += 1;

      await prisma.programMedia.deleteMany({ where: { programId: program.id } });
      await prisma.programMedia.createMany({
        data: [1, 2].map((n) => ({
          programId: program.id,
          type: 'IMAGE' as const,
          url: `https://picsum.photos/seed/${slug}-${n}/1600/1000`,
          altText: `${p.title} 이미지 ${n}`,
          sortOrder: n,
        })),
      });
    }
  }

  // 6) 참고 환율 (append-only — 동일 asOf는 upsert로 수렴)
  for (const r of exchangeRateSeeds) {
    await prisma.exchangeRate.upsert({
      where: {
        baseCurrency_quoteCurrency_asOf: {
          baseCurrency: r.baseCurrency,
          quoteCurrency: r.quoteCurrency,
          asOf: r.asOf,
        },
      },
      create: r,
      update: { rate: r.rate, source: r.source },
    });
  }

  // 7) 플랫폼 설정
  for (const s of platformSettingSeeds) {
    await prisma.platformSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value as object },
      update: { value: s.value as object },
    });
  }

  // 8) 테스트 계정 약관 동의 기록 (idempotent — 없을 때만 생성)
  const termsVersion = '2026-07-01';
  const testEmails = [
    'traveler@test.com',
    'admin@test.com',
    'expert@test.com',
    'expert-pending@test.com',
  ];
  for (const email of testEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    for (const type of ['TERMS', 'PRIVACY'] as const) {
      const exists = await prisma.consentRecord.findFirst({
        where: { userId: user.id, type, version: termsVersion },
      });
      if (!exists) {
        await prisma.consentRecord.create({
          data: { userId: user.id, type, version: termsVersion, granted: true },
        });
      }
    }
  }

  // 결과 요약
  const counts = {
    users: await prisma.user.count(),
    travelerProfiles: await prisma.travelerProfile.count(),
    expertProfiles: await prisma.expertProfile.count(),
    serviceAreas: await prisma.expertServiceArea.count(),
    destinations: await prisma.destination.count(),
    categories: await prisma.category.count(),
    programs: await prisma.program.count(),
    programMedia: await prisma.programMedia.count(),
    exchangeRates: await prisma.exchangeRate.count(),
    platformSettings: await prisma.platformSetting.count(),
    consentRecords: await prisma.consentRecord.count(),
  };
  console.log('[seed] 완료 —', JSON.stringify(counts));
  console.log(`[seed] 프로그램 upsert 처리: ${programCount}건`);
}

main()
  .catch((error) => {
    console.error('[seed] 실패:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
