// 15개 한달살기 목적 카테고리 (스펙 §1)
export interface CategorySeed {
  slug: string;
  nameKo: string;
  nameEn: string;
  descriptionKo: string;
  icon: string; // 아이콘 식별자 (lucide 아이콘 이름 기준)
  sortOrder: number;
}

export const categorySeeds: CategorySeed[] = [
  {
    slug: 'travel-culture',
    nameKo: '여행·현지 문화 체험',
    nameEn: 'Travel & Local Culture',
    descriptionKo: '현지인처럼 살아보는 여행과 문화 체험',
    icon: 'map',
    sortOrder: 1,
  },
  {
    slug: 'fitness',
    nameKo: '운동·체력 관리',
    nameEn: 'Fitness & Training',
    descriptionKo: '퍼스널 트레이닝과 꾸준한 체력 관리',
    icon: 'dumbbell',
    sortOrder: 2,
  },
  {
    slug: 'yoga-pilates',
    nameKo: '요가·필라테스',
    nameEn: 'Yoga & Pilates',
    descriptionKo: '몸과 마음의 균형을 찾는 수련',
    icon: 'heart',
    sortOrder: 3,
  },
  {
    slug: 'golf',
    nameKo: '골프',
    nameEn: 'Golf',
    descriptionKo: '전지훈련식 골프 레슨과 라운딩',
    icon: 'flag',
    sortOrder: 4,
  },
  {
    slug: 'surfing',
    nameKo: '서핑·해양 스포츠',
    nameEn: 'Surfing & Water Sports',
    descriptionKo: '파도와 바다에서 보내는 한 달',
    icon: 'waves',
    sortOrder: 5,
  },
  {
    slug: 'diet-wellness',
    nameKo: '다이어트·웰니스',
    nameEn: 'Diet & Wellness',
    descriptionKo: '식단·운동·회복을 아우르는 웰니스 리셋',
    icon: 'leaf',
    sortOrder: 6,
  },
  {
    slug: 'remote-work',
    nameKo: '원격근무·디지털 노마드',
    nameEn: 'Remote Work & Nomad',
    descriptionKo: '일과 삶의 새로운 균형, 워케이션',
    icon: 'laptop',
    sortOrder: 7,
  },
  {
    slug: 'startup-networking',
    nameKo: '창업·비즈니스 네트워킹',
    nameEn: 'Startup & Networking',
    descriptionKo: '현지 창업 생태계와의 연결',
    icon: 'briefcase',
    sortOrder: 8,
  },
  {
    slug: 'language-study',
    nameKo: '언어 공부',
    nameEn: 'Language Study',
    descriptionKo: '영어·태국어·베트남어·한국어 몰입 학습',
    icon: 'languages',
    sortOrder: 9,
  },
  {
    slug: 'meditation-healing',
    nameKo: '명상·힐링',
    nameEn: 'Meditation & Healing',
    descriptionKo: '멈추고 돌아보는 회복의 시간',
    icon: 'sparkles',
    sortOrder: 10,
  },
  {
    slug: 'cooking-food',
    nameKo: '요리·현지 음식',
    nameEn: 'Cooking & Food',
    descriptionKo: '시장부터 주방까지, 현지 음식 탐구',
    icon: 'chef-hat',
    sortOrder: 11,
  },
  {
    slug: 'photo-video',
    nameKo: '사진·영상',
    nameEn: 'Photo & Video',
    descriptionKo: '한 달의 기록을 작품으로',
    icon: 'camera',
    sortOrder: 12,
  },
  {
    slug: 'pet-companion',
    nameKo: '반려동물 동반',
    nameEn: 'With Pets',
    descriptionKo: '반려동물과 함께하는 안전한 체류',
    icon: 'paw-print',
    sortOrder: 13,
  },
  {
    slug: 'family-kids',
    nameKo: '가족·아이와 함께',
    nameEn: 'Family & Kids',
    descriptionKo: '아이의 시야가 넓어지는 가족 체류',
    icon: 'users',
    sortOrder: 14,
  },
  {
    slug: 'retirement-longstay',
    nameKo: '은퇴 준비·장기 체류',
    nameEn: 'Retirement & Long Stay',
    descriptionKo: '장기 체류를 미리 살아보는 경험',
    icon: 'sunset',
    sortOrder: 15,
  },
];
