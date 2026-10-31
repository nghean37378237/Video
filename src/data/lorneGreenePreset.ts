import { PresetId, ProjectSettings, StoryScene, VaultItem } from '../types';

export const REFERENCE_VIDEOS: Record<PresetId, { title: string; url: string; durationSec: number }> = {
  'lorne-greene': {
    title: 'Kịch Bản Mẫu 1: Lorne Greene & Chú Ngựa Buck',
    url: '',
    durationSec: 120,
  },
  'clayton-moore': {
    title: 'Kịch Bản Mẫu 2: Clayton Moore — Mặt Nạ Lone Ranger',
    url: '',
    durationSec: 90,
  },
  'yul-brynner': {
    title: 'Kịch Bản Mẫu 3: Yul Brynner — Nhà Vua & Tay Súng',
    url: '',
    durationSec: 90,
  },
};

export const REFERENCE_VIDEO_URL = '';

export const INITIAL_PROJECT_SETTINGS: ProjectSettings = {
  projectTitle: 'Dự Án Video Kể Chuyện Mới',
  activePresetId: 'lorne-greene',
  referenceVideoUrl: '',
  aspectRatio: '3:4',
  audioMode: 'stitched-scenes',
  subtitleLanguage: 'en',
  activeWordColor: '#FFD700',
  wordsPerLine: 4,
  subtitleYPercent: 86,
  enableFilmGrain: true,
  showWaveformBadge: true,
  bgMusicStyle: 'western-acoustic',
  bgMusicVolume: 0.25,
  voiceoverVolume: 1.0,
  ttsVoice: 'Charon',
  channelTitle: 'LIFE LEGENDS',
  channelInitials: 'LL',
  channelMotto: 'THEIR LEGACY. YOUR INSPIRATION.',
};

// Kho tư liệu khởi đầu hoàn toàn trống (đã bỏ toàn bộ video và ảnh cũ lưu sẵn)
export const INITIAL_VAULT_ITEMS: VaultItem[] = [];

export const LORNE_GREENE_SCENES: StoryScene[] = [
  {
    id: 'lg-1',
    order: 1,
    title: 'Mở đầu: Anh hùng & Ngựa quý',
    sceneType: 'video',
    durationSec: 8,
    narrationText:
      'Every hero needs a good horse. For Lorne Greene, that horse was named Buck. And what happened after Bonanza ended, nobody saw coming.',
    translationText:
      'Mỗi anh hùng đều cần một con ngựa tốt. Với Lorne Greene, chú ngựa ấy tên là Buck. Và điều xảy ra sau khi Bonanza kết thúc không ai ngờ tới.',
    visualPrompt: 'CẦN VIDEO: Cảnh nhân vật cưỡi ngựa bên hồ nước xanh và nói chuyện trực diện',
    imagePrompt:
      'Cinematic 1960s color photograph of older cowboy actor Lorne Greene wearing a tan cowboy hat and brown leather vest, sitting on a golden buckskin horse with dark mane beside a calm mountain lake, natural sunlight, 3:4 portrait aspect ratio, photorealistic.',
    videoMotionPrompt:
      'The cowboy on the golden buckskin horse speaks calmly to the camera while the horse trots slowly forward along the grassy lakeside, gentle breeze, realistic lip movements, steady tracking shot.',
    archivalKeywords: 'Lorne Greene riding Buck horse Bonanza color photo',
    motionEffect: 'static',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'lg-2',
    order: 2,
    title: 'Đêm Chủ Nhật năm 1959',
    sceneType: 'image',
    durationSec: 8,
    narrationText:
      'Sunday nights, 1959. That galloping theme song filled living rooms all across America, and a whole country met the Cartwright family.',
    translationText:
      'Những đêm Chủ Nhật năm 1959. Bản nhạc phim rộn ràng vang khắp các phòng khách nước Mỹ, đưa cả đất nước gặp gỡ gia đình Cartwright.',
    visualPrompt: 'CẦN ẢNH TĨNH: 4 cha con nhà Cartwright trước hiên nhà gỗ',
    imagePrompt:
      '1959 black and white archival promotional portrait of the four Bonanza actors (Lorne Greene, Pernell Roberts, Dan Blocker, Michael Landon) in western attire on a wooden ranch porch, crisp vintage film grain, 3:4 aspect ratio.',
    videoMotionPrompt:
      'Vintage black and white film scene: the four western ranch brothers and father exchange warm glances and speak naturally on the wooden porch, subtle camera push-in.',
    archivalKeywords: 'Bonanza 1959 cast Cartwright family black and white',
    motionEffect: 'zoom-in',
    colorFilter: 'bw-vintage',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'lg-3',
    order: 3,
    title: 'Thẻ Chữ Đen: Giọng nói từ Ottawa',
    sceneType: 'quote',
    durationSec: 7,
    narrationText:
      'Lorne Greene was born in Ottawa, Canada, in nineteen fifteen. And long before Bonanza, people knew him by his voice.',
    translationText:
      'Lorne Greene sinh ra tại Ottawa, Canada năm 1915. Và rất lâu trước Bonanza, công chúng đã nhớ đến ông qua giọng nói.',
    visualPrompt: 'THẺ CHỮ ĐEN TỰ ĐỘNG: Không cần tải ảnh hay video',
    imagePrompt: 'Không cần tạo ảnh (Ứng dụng tự động dựng thẻ chữ trắng trên nền đen tuyền).',
    videoMotionPrompt: 'Không cần tạo video.',
    motionEffect: 'static',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: false,
  },
  {
    id: 'lg-4',
    order: 4,
    title: 'Outro: Huy Hiệu Life Legends',
    sceneType: 'outro',
    durationSec: 4,
    narrationText: 'Life Legends. Their Legacy. Your Inspiration.',
    translationText: 'Huyền Thoại Cuộc Đời. Di sản của họ. Cảm hứng của bạn.',
    visualPrompt: 'LOGO KẾT TỰ ĐỘNG: Huy hiệu đại bàng vàng Life Legends',
    imagePrompt: 'Không cần tạo ảnh (Ứng dụng tự động vẽ Huy hiệu Kênh).',
    videoMotionPrompt: 'Không cần tạo video.',
    motionEffect: 'zoom-in',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: false,
  },
];

export const CLAYTON_MOORE_SCENES: StoryScene[] = LORNE_GREENE_SCENES;
export const YUL_BRYNNER_SCENES: StoryScene[] = LORNE_GREENE_SCENES;

export const PRESET_SCENES_MAP: Record<PresetId, StoryScene[]> = {
  'lorne-greene': LORNE_GREENE_SCENES,
  'clayton-moore': CLAYTON_MOORE_SCENES,
  'yul-brynner': YUL_BRYNNER_SCENES,
};
