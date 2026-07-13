// 테스트 로그인 계정 4종 (README 문서화 대상). 비밀번호는 seed 실행 시 bcrypt 해시로 저장한다.
// 전문가 2계정(expert@test.com, expert-pending@test.com)은 experts.ts에서 정의된다.
export const TEST_PASSWORD = 'Test1234!';

export interface UserSeed {
  email: string;
  role: 'TRAVELER' | 'ADMIN';
  name: string;
  fullName: string;
  preferredLanguage: string;
  country: string;
  timezone: string;
}

export const userSeeds: UserSeed[] = [
  {
    email: 'traveler@test.com',
    role: 'TRAVELER',
    name: '김여행',
    fullName: '김여행',
    preferredLanguage: 'ko',
    country: 'KR',
    timezone: 'Asia/Seoul',
  },
  {
    email: 'admin@test.com',
    role: 'ADMIN',
    name: '운영자',
    fullName: '플랫폼 운영자',
    preferredLanguage: 'ko',
    country: 'KR',
    timezone: 'Asia/Seoul',
  },
];

// traveler@test.com의 여행 선호 프로필 (Phase 3 추천 개발용)
export const travelerProfileSeed = {
  travelPurposes: ['fitness', 'remote-work'],
  preferredCountries: ['KR', 'TH'],
  preferredCities: ['jeju', 'chiang-mai'],
  budgetMin: 1_500_000,
  budgetMax: 3_000_000,
  budgetCurrency: 'KRW' as const,
  preferredLanguages: ['ko', 'en'],
  travelStyles: ['nature', 'quiet', 'flexible'],
  groupSize: 1,
  hasChildren: false,
  hasPet: false,
};
