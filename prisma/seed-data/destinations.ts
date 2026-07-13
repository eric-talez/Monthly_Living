// 9개 도시 — 실좌표·IANA timezone·현지 통화. 이미지 URL은 개발용 placeholder(picsum)이며
// production 전 실사진으로 교체해야 한다 (README 참고).
export interface DestinationSeed {
  slug: string;
  countryCode: 'KR' | 'TH' | 'VN';
  countryNameKo: string;
  countryNameEn: string;
  cityNameKo: string;
  cityNameEn: string;
  descriptionKo: string;
  descriptionEn: string;
  latitude: string;
  longitude: string;
  timezone: string;
  currency: 'KRW' | 'THB' | 'VND';
  sortOrder: number;
}

const cover = (slug: string) => `https://picsum.photos/seed/${slug}/2000/1200`;

const raw: DestinationSeed[] = [
  {
    slug: 'jeju',
    countryCode: 'KR',
    countryNameKo: '대한민국',
    countryNameEn: 'South Korea',
    cityNameKo: '제주',
    cityNameEn: 'Jeju',
    descriptionKo:
      '한라산과 바다가 함께하는 섬. 자연 속 휴식과 운동, 워케이션까지 모두 가능한 한달살기 대표 지역.',
    descriptionEn:
      'An island of volcanic peaks and open sea — Korea’s most beloved month-long stay destination.',
    latitude: '33.4996',
    longitude: '126.5312',
    timezone: 'Asia/Seoul',
    currency: 'KRW',
    sortOrder: 1,
  },
  {
    slug: 'bangkok',
    countryCode: 'TH',
    countryNameKo: '태국',
    countryNameEn: 'Thailand',
    cityNameKo: '방콕',
    cityNameEn: 'Bangkok',
    descriptionKo: '아시아 최대의 도시 에너지와 미식, 코워킹 인프라가 모인 디지털 노마드의 관문.',
    descriptionEn: 'A gateway city for digital nomads with world-class food and coworking culture.',
    latitude: '13.7563',
    longitude: '100.5018',
    timezone: 'Asia/Bangkok',
    currency: 'THB',
    sortOrder: 2,
  },
  {
    slug: 'chiang-mai',
    countryCode: 'TH',
    countryNameKo: '태국',
    countryNameEn: 'Thailand',
    cityNameKo: '치앙마이',
    cityNameEn: 'Chiang Mai',
    descriptionKo: '올드타운의 사원과 카페, 저렴한 생활비 — 세계 노마드들이 사랑하는 북부 도시.',
    descriptionEn:
      'Temples, cafés, and a slow northern pace — a global favorite for remote workers.',
    latitude: '18.7883',
    longitude: '98.9853',
    timezone: 'Asia/Bangkok',
    currency: 'THB',
    sortOrder: 3,
  },
  {
    slug: 'phuket',
    countryCode: 'TH',
    countryNameKo: '태국',
    countryNameEn: 'Thailand',
    cityNameKo: '푸껫',
    cityNameEn: 'Phuket',
    descriptionKo: '안다만해의 해변 리조트 섬. 서핑·다이빙·웰니스 리트리트의 중심지.',
    descriptionEn:
      'Andaman beaches, surf, dive, and wellness retreats on Thailand’s largest island.',
    latitude: '7.8804',
    longitude: '98.3923',
    timezone: 'Asia/Bangkok',
    currency: 'THB',
    sortOrder: 4,
  },
  {
    slug: 'koh-samui',
    countryCode: 'TH',
    countryNameKo: '태국',
    countryNameEn: 'Thailand',
    cityNameKo: '코사무이',
    cityNameEn: 'Koh Samui',
    descriptionKo: '야자수 해변과 요가 리트리트로 유명한 조용한 섬 — 힐링 한달살기에 최적.',
    descriptionEn: 'A quiet island of palm beaches and yoga retreats, made for slow living.',
    latitude: '9.5120',
    longitude: '100.0136',
    timezone: 'Asia/Bangkok',
    currency: 'THB',
    sortOrder: 5,
  },
  {
    slug: 'da-nang',
    countryCode: 'VN',
    countryNameKo: '베트남',
    countryNameEn: 'Vietnam',
    cityNameKo: '다낭',
    cityNameEn: 'Da Nang',
    descriptionKo: '미케비치와 골프장, 한국인이 가장 사랑하는 베트남 중부의 해변 도시.',
    descriptionEn: 'My Khe beach and golf courses — central Vietnam’s favorite coastal city.',
    latitude: '16.0544',
    longitude: '108.2022',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    sortOrder: 6,
  },
  {
    slug: 'ho-chi-minh',
    countryCode: 'VN',
    countryNameKo: '베트남',
    countryNameEn: 'Vietnam',
    cityNameKo: '호찌민',
    cityNameEn: 'Ho Chi Minh City',
    descriptionKo: '베트남 경제의 심장. 스타트업과 비즈니스 네트워킹, 활기찬 도시 생활.',
    descriptionEn: 'Vietnam’s economic heart — startups, networking, and vibrant city life.',
    latitude: '10.8231',
    longitude: '106.6297',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    sortOrder: 7,
  },
  {
    slug: 'hanoi',
    countryCode: 'VN',
    countryNameKo: '베트남',
    countryNameEn: 'Vietnam',
    cityNameKo: '하노이',
    cityNameEn: 'Hanoi',
    descriptionKo: '천년 고도의 골목과 커피 문화 — 현지 문화 체험과 언어 공부에 어울리는 수도.',
    descriptionEn:
      'A thousand-year capital of alleys and coffee culture, ideal for language and culture stays.',
    latitude: '21.0285',
    longitude: '105.8542',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    sortOrder: 8,
  },
  {
    slug: 'nha-trang',
    countryCode: 'VN',
    countryNameKo: '베트남',
    countryNameEn: 'Vietnam',
    cityNameKo: '나트랑',
    cityNameEn: 'Nha Trang',
    descriptionKo: '긴 백사장과 섬 투어, 해양 스포츠의 도시. 가족 단위 한달살기로 인기.',
    descriptionEn: 'Long white beaches and island hopping — popular with families on long stays.',
    latitude: '12.2388',
    longitude: '109.1967',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    sortOrder: 9,
  },
];

export const destinationSeeds = raw.map((d) => ({ ...d, coverImageUrl: cover(d.slug) }));
