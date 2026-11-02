import { PresetId, ProjectSettings, StoryScene, VaultItem } from '../types';

export const REFERENCE_VIDEOS: Record<PresetId, { title: string; url: string; durationSec: number }> = {
  'will-sampson': {
    title: 'Mẫu Chuẩn Voice & Nhạc Dạo: Will Sampson — Người Khổng Lồ Dịu Dàng (16 Cảnh)',
    url: '/assets/aistudio/November_is_Native_American_Heritage_Month__and_theres_no_better_way_to_begin_it_than_by_remembering_Will_Sampson.___Xem_th_m_120ca8dc.mp3',
    durationSec: 183,
  },
  'lorne-greene': {
    title: 'Kịch Bản Mẫu 2: Lorne Greene & Chú Ngựa Buck',
    url: '',
    durationSec: 120,
  },
  'clayton-moore': {
    title: 'Kịch Bản Mẫu 3: Clayton Moore — Mặt Nạ Lone Ranger',
    url: '',
    durationSec: 90,
  },
  'yul-brynner': {
    title: 'Kịch Bản Mẫu 4: Yul Brynner — Nhà Vua & Tay Súng',
    url: '',
    durationSec: 90,
  },
};

export const REFERENCE_VIDEO_URL = '';

export const FIXED_OUTRO_LOGO_URL = '/assets/aistudio/image_4653598d.png';

export const INITIAL_PROJECT_SETTINGS: ProjectSettings = {
  projectTitle: 'Will Sampson — Người Khổng Lồ Dịu Dàng (Chuẩn Voice & Nhạc Dạo)',
  activePresetId: 'will-sampson',
  referenceVideoUrl: '',
  aspectRatio: '3:4',
  audioMode: 'stitched-scenes',
  transitionStyle: 'cinema-auto',
  transitionDurationSec: 1.2,
  subtitleLanguage: 'en',
  voiceLanguage: 'en',
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
  channelInitials: 'HM',
  channelMotto: 'THEIR LEGACY. YOUR INSPIRATION.',
};

// Kho tư liệu khởi đầu hoàn toàn trống
export const INITIAL_VAULT_ITEMS: VaultItem[] = [];

export const WILL_SAMPSON_SCENES: StoryScene[] = [
  {
    id: 'ws-1',
    order: 1,
    title: 'Mở đầu: Bước vào kiệt tác điện ảnh',
    sceneType: 'video',
    durationSec: 9,
    voiceoverUrl: '/assets/aistudio/ws_scene_01.mp3',
    narrationText:
      'No acting lessons. No screen tests. No experience at all. Yet Will Sampson walked into one of the greatest films ever made.',
    translationText:
      'Không một lớp học diễn xuất. Không buổi thử vai. Chẳng có chút kinh nghiệm nào. Vậy mà Will Sampson đã bước thẳng vào một trong những bộ phim vĩ đại nhất lịch sử.',
    visualPrompt: 'CẦN VIDEO: Chân dung cận cảnh Will Sampson (Chief Bromden) ánh mắt trầm tĩnh đầy nội lực',
    imagePrompt:
      'Cinematic 1975 35mm film portrait of Native American actor Will Sampson with long dark hair and a calm, powerful expression, warm documentary lighting, full-bleed 3:4 vertical frame, photorealistic.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the reference portrait of Native American actor Will Sampson, he stands with quiet dignity and steady breathing -> [2-4s Story Action & Speech]: Preserving 100% exact facial identity from the reference image, he turns his deep, calm eyes directly toward the camera with a subtle reflective nod -> [4-6s Camera Control & Climax]: Slow cinematic Kling dolly push-in to a medium close-up under warm golden studio lighting.',
    archivalKeywords: 'Will Sampson actor portrait 1975',
    motionEffect: 'zoom-in',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-2',
    order: 2,
    title: 'Tháng Di Sản Bản Địa & Người Khổng Lồ Dịu Dàng',
    sceneType: 'image',
    durationSec: 7,
    voiceoverUrl: '/assets/aistudio/ws_scene_02.mp3',
    narrationText:
      "This November is Native American Heritage Month. And there's no better way to begin it than with the story of this gentle giant.",
    translationText:
      'Tháng Mười Một là Tháng Di sản Người Mỹ Bản địa. Và không có cách nào tuyệt vời hơn để bắt đầu ngoài câu chuyện về người khổng lồ dịu dàng này.',
    visualPrompt: 'CẦN ẢNH TĨNH: Ảnh chân dung đời thường ấm áp của Will Sampson đội mũ cao bồi',
    imagePrompt:
      'Vintage 1970s documentary photograph of Will Sampson wearing a western cowboy hat and denim jacket, warm gentle smile, American Southwest backdrop, 3:4 portrait aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the vintage portrait of Will Sampson in a cowboy hat, he looks out over the horizon -> [2-4s Story Action]: Preserving 100% exact facial identity, a warm gentle smile appears on his face -> [4-6s Camera Control]: Smooth slow camera pan across the sunlit western landscape.',
    archivalKeywords: 'Will Sampson Native American actor cowboy hat',
    motionEffect: 'pan-right',
    colorFilter: 'color-warm',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-3',
    order: 3,
    title: 'Thẻ Chữ Đen: Okmulgee, Oklahoma (27/09/1933)',
    sceneType: 'quote',
    durationSec: 9,
    voiceoverUrl: '/assets/aistudio/ws_scene_03.mp3',
    narrationText:
      'Okmulgee, Oklahoma, September 27th, 1933. A baby boy is born into the proud Muscogee Creek Nation.',
    translationText:
      'Okmulgee, Oklahoma, ngày 27 tháng 9 năm 1933. Một bé trai chào đời trong cộng đồng bộ tộc Muscogee Creek đầy kiêu hãnh.',
    visualPrompt: 'THẺ CHỮ ĐEN TỰ ĐỘNG: Không cần tải ảnh hay video',
    imagePrompt: 'Không cần tạo ảnh (Ứng dụng tự động dựng thẻ chữ trắng trên nền đen tuyền).',
    videoMotionPrompt: 'Không cần tạo video.',
    motionEffect: 'static',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: false,
  },
  {
    id: 'ws-4',
    order: 4,
    title: 'Chàng thanh niên cao hơn 1m98',
    sceneType: 'image',
    durationSec: 10,
    voiceoverUrl: '/assets/aistudio/ws_scene_04.mp3',
    narrationText:
      'He grew up tall, then taller, then taller still. Well over six and a half feet. A quiet young man with strong hands and a watchful eye.',
    translationText:
      'Cậu lớn lên cao mãi, vượt hơn 1m98. Một chàng trai trẻ trầm lặng với đôi bàn tay rắn rỏi và ánh mắt quan sát tinh tường.',
    visualPrompt: 'CẦN ẢNH TĨNH: Chàng trai Will Sampson cao lớn trầm tĩnh thời trẻ tại Oklahoma',
    imagePrompt:
      '1950s black and white archival photograph of a towering 6 foot 7 young Native American man in work shirt and jeans standing beside a wooden ranch fence in Oklahoma, crisp vintage film grain, 3:4 aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the 1950s black-and-white ranch photograph, the tall young man leans calmly against the wooden fence -> [2-4s Story Action]: Preserving 100% exact facial identity, he looks thoughtfully across the prairie as wind moves the tall grass -> [4-6s Camera Control]: Slow upward camera tilt emphasizing his towering 6-foot-7 stature.',
    archivalKeywords: 'Will Sampson young tall Muscogee Creek Oklahoma',
    motionEffect: 'zoom-in',
    colorFilter: 'bw-vintage',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-5',
    order: 5,
    title: 'Đam mê đầu đời: Những đấu trường Rodeo',
    sceneType: 'video',
    durationSec: 13,
    voiceoverUrl: '/assets/aistudio/ws_scene_05.mp3',
    narrationText:
      "His first love wasn't Hollywood. It was the rodeo. Year after year he climbed onto bucking broncos and rode them across the American West. Dust. Sweat. Bruises. Broken bones.",
    translationText:
      'Tình yêu đầu tiên của ông không phải Hollywood, mà là đấu trường Rodeo. Năm này qua năm khác, ông cưỡi những chú ngựa bất kham băng qua miền Tây nước Mỹ. Bụi mờ. Mồ hôi. Những vết bầm và xương gãy.',
    visualPrompt: 'CẦN VIDEO: Cảnh cưỡi ngựa Rodeo tung bụi mù mịt miền Tây nước Mỹ',
    imagePrompt:
      '1960s vintage documentary action photograph of a tall Native American rodeo cowboy riding a bucking bronco in a dusty western arena, dramatic sunlight through clouds of dust, 3:4 portrait aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the vintage 1960s rodeo arena frame, the tall cowboy holds tightly to the reins atop a powerful bucking bronco -> [2-4s Story Action]: Dust billows upward under the stadium lights as he balances with rugged determination -> [4-6s Camera Control]: Dynamic slow-motion tracking shot capturing the raw grit of the American West rodeo.',
    archivalKeywords: 'Will Sampson cowboy western rodeo',
    motionEffect: 'zoom-out',
    colorFilter: 'sepia',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-6',
    order: 6,
    title: 'Người nghệ sĩ cầm cọ vẽ giữa những mùa Rodeo',
    sceneType: 'image',
    durationSec: 15,
    voiceoverUrl: '/assets/aistudio/ws_scene_06.mp3',
    narrationText:
      'In between the rodeos, he picked up a paintbrush and did something nobody expected. He painted. Beautiful pictures of Native life, history, and pride. The rough rodeo cowboy was also a gifted artist.',
    translationText:
      'Giữa những mùa giải Rodeo, ông cầm lấy cọ vẽ và làm điều không ai ngờ tới. Ông vẽ những bức tranh tuyệt đẹp về đời sống, lịch sử và niềm tự hào bản địa. Chàng cao bồi gai góc ấy lại là một họa sĩ tài hoa.',
    visualPrompt: 'CẦN ẢNH TĨNH: Will Sampson bên giá vẽ những bức tranh lịch sử người bản địa',
    imagePrompt:
      '1970s warm archival photograph of Native American artist and actor Will Sampson holding a paintbrush beside a canvas painting of traditional Muscogee Creek life, natural window light, 3:4 aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the studio portrait of Will Sampson beside his easel, he holds a fine paintbrush with steady hands -> [2-4s Story Action]: Preserving 100% exact facial identity, he adds a careful brushstroke to the canvas and looks up warmly -> [4-6s Camera Control]: Gentle dolly push-in toward the artist and his painting.',
    archivalKeywords: 'Will Sampson painter artist Native American art',
    motionEffect: 'pan-left',
    colorFilter: 'color-warm',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-7',
    order: 7,
    title: 'Cuộc tìm kiếm vai Chief Bromden (Bay Trên Tổ Chim Cúc Cu)',
    sceneType: 'image',
    durationSec: 16,
    voiceoverUrl: '/assets/aistudio/ws_scene_07.mp3',
    narrationText:
      "Then, in the 1970s, the filmmakers behind One Flew Over the Cuckoo's Nest started a search for a very special man. They needed someone to play Chief Bromden, a towering, silent patient who seems to see everything and says nothing.",
    translationText:
      'Rồi vào thập niên 1970, đoàn làm phim Bay Trên Tổ Chim Cúc Cu bắt đầu tìm kiếm một người thật đặc biệt. Họ cần người hóa thân thành Tù trưởng Bromden — bệnh nhân khổng lồ, lặng thinh nhưng thấu suốt mọi điều.',
    visualPrompt: 'CẦN ẢNH TĨNH: Hình ảnh nhân vật Chief Bromden cao lớn trầm mặc trong One Flew Over the Cuckoo’s Nest',
    imagePrompt:
      '1975 film still portrait of Will Sampson as Chief Bromden in One Flew Over the Cuckoos Nest, wearing hospital work clothes, towering silently with deep expressive eyes, 3:4 vertical aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the 1975 film frame of Will Sampson as Chief Bromden, he stands silently observing the room -> [2-4s Story Action]: Preserving 100% exact facial identity, his eyes convey deep unspoken wisdom and empathy -> [4-6s Camera Control]: Slow atmospheric camera push-in to his expressive face.',
    archivalKeywords: 'Will Sampson Chief Bromden One Flew Over the Cuckoos Nest 1975',
    motionEffect: 'zoom-in',
    colorFilter: 'bw-vintage',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-8',
    order: 8,
    title: 'Thẻ Chữ Đen: Khoảnh khắc định mệnh tìm thấy Tù Trưởng',
    sceneType: 'quote',
    durationSec: 9,
    voiceoverUrl: '/assets/aistudio/ws_scene_08.mp3',
    narrationText:
      'Will Sampson had never acted a single day in his life. But the moment they met him, they knew. They had found their Chief.',
    translationText:
      'Will Sampson chưa từng diễn xuất một ngày nào trong đời. Nhưng ngay khoảnh khắc gặp ông, họ biết mình đã tìm thấy vị Tù trưởng.',
    visualPrompt: 'THẺ CHỮ ĐEN TỰ ĐỘNG: Không cần tải ảnh hay video',
    imagePrompt: 'Không cần tạo ảnh (Ứng dụng tự động dựng thẻ chữ trắng trên nền đen tuyền).',
    videoMotionPrompt: 'Không cần tạo video.',
    motionEffect: 'static',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: false,
  },
  {
    id: 'ws-9',
    order: 9,
    title: 'Năm 1975: Sánh vai cùng Jack Nicholson',
    sceneType: 'video',
    durationSec: 9,
    voiceoverUrl: '/assets/aistudio/ws_scene_09.mp3',
    narrationText:
      '1975. The film hit theaters. And beside Jack Nicholson, this quiet cowboy gave a performance audiences would never forget.',
    translationText:
      'Năm 1975, bộ phim ra rạp. Sánh bước bên cạnh Jack Nicholson, chàng cao bồi trầm lặng đã mang đến một màn trình diễn mà khán giả không bao giờ quên.',
    visualPrompt: 'CẦN VIDEO: Cảnh Will Sampson và Jack Nicholson trong One Flew Over the Cuckoo’s Nest (1975)',
    imagePrompt:
      '1975 movie still of Will Sampson as Chief Bromden standing beside Jack Nicholson as McMurphy in One Flew Over the Cuckoos Nest, classic 1970s cinema color grading, 3:4 aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the 1975 cinema frame of Will Sampson and Jack Nicholson, the two characters share a quiet bond -> [2-4s Story Action]: Preserving 100% exact facial identity, Will Sampson exchanges a subtle, knowing look of friendship -> [4-6s Camera Control]: Smooth cinematic dolly shot.',
    archivalKeywords: 'Will Sampson Jack Nicholson One Flew Over the Cuckoos Nest',
    motionEffect: 'pan-right',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-10',
    order: 10,
    title: 'Kỳ tích càn quét 5 giải Oscar danh giá nhất',
    sceneType: 'image',
    durationSec: 12,
    voiceoverUrl: '/assets/aistudio/ws_scene_10.mp3',
    narrationText:
      'Then the film did something remarkable. It swept the top five Academy Awards. Best Picture, Best Actor, Best Actress, Best Director, Best Screenplay.',
    translationText:
      'Và bộ phim đã lập nên kỳ tích phi thường: càn quét cả 5 giải Oscar lớn nhất — Phim hay nhất, Nam/Nữ chính xuất sắc nhất, Đạo diễn và Kịch bản xuất sắc nhất.',
    visualPrompt: 'CẦN ẢNH TĨNH: Đoàn phim One Flew Over the Cuckoo’s Nest và tượng vàng Oscar 1976',
    imagePrompt:
      '1976 Academy Awards archival photograph celebrating One Flew Over the Cuckoos Nest winning five Oscars, golden statuettes under stage lights, vintage 1970s photojournalism, 3:4 aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the 1976 Academy Awards celebration photograph, stage lights gleam across the golden Oscar statuettes -> [2-4s Story Action]: Warm applause and camera flashes illuminate the historic night -> [4-6s Camera Control]: Slow majestic zoom-in.',
    archivalKeywords: 'One Flew Over the Cuckoos Nest 1975 cast Will Sampson',
    motionEffect: 'zoom-in',
    colorFilter: 'color-warm',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-11',
    order: 11,
    title: 'Cảnh kết huyền thoại khiến cả rạp phim vỡ òa',
    sceneType: 'video',
    durationSec: 10,
    voiceoverUrl: '/assets/aistudio/ws_scene_11.mp3',
    narrationText:
      "And that final scene, the Chief's heart-pounding escape, left movie theaters across America cheering. Some called it one of the greatest endings ever filmed.",
    translationText:
      'Và phân cảnh cuối cùng — cuộc đào thoát nghẹt thở của vị Tù trưởng — đã khiến các rạp chiếu khắp nước Mỹ vỡ òa reo hò. Một trong những cái kết vĩ đại nhất lịch sử điện ảnh.',
    visualPrompt: 'CẦN VIDEO: Cảnh Chief Bromden bước ra tự do trong ánh bình minh cuối phim',
    imagePrompt:
      'Cinematic 1975 film shot of Will Sampson as Chief Bromden lifting the heavy marble hydrotherapy console with immense strength before stepping out into the dawn mist, dramatic backlighting, 3:4 aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the dramatic 1975 scene of Chief Bromden, he stands tall in the cool blue dawn light -> [2-4s Story Action]: Preserving 100% exact facial identity, he strides forward into the open misty meadow toward freedom -> [4-6s Camera Control]: Sweeping cinematic crane shot rising into the morning sky.',
    archivalKeywords: 'Chief Bromden Will Sampson escape scene Cuckoos Nest',
    motionEffect: 'zoom-out',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-12',
    order: 12,
    title: 'Tù trưởng Ten Bears đối diện Clint Eastwood (1976)',
    sceneType: 'image',
    durationSec: 16,
    voiceoverUrl: '/assets/aistudio/ws_scene_12.mp3',
    narrationText:
      "A year later, Western fans met him again, as the proud Comanche Chief Ten Bears in The Outlaw Josey Wales. Face to face with Clint Eastwood, two warriors chose peace over bloodshed. It's still one of the most moving moments in any Western.",
    translationText:
      'Một năm sau, khán giả dòng phim Viễn Tây gặp lại ông trong vai Tù trưởng Comanche Ten Bears đầy kiêu hãnh trong The Outlaw Josey Wales. Đối mặt với Clint Eastwood, hai chiến binh đã chọn hòa bình thay vì đổ máu.',
    visualPrompt: 'CẦN ẢNH TĨNH: Will Sampson vai Tù trưởng Ten Bears đối diện Clint Eastwood trong The Outlaw Josey Wales',
    imagePrompt:
      '1976 Western film photograph of Will Sampson as Comanche Chief Ten Bears in traditional regalia standing face to face with Clint Eastwood in The Outlaw Josey Wales, warm desert sunlight, 3:4 aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the 1976 Western still of Will Sampson as Chief Ten Bears facing Clint Eastwood -> [2-4s Story Action]: Preserving 100% exact facial identity, Chief Ten Bears speaks with calm authority and extends a gesture of peace -> [4-6s Camera Control]: Slow cinematic push-in capturing the mutual respect between the two warriors.',
    archivalKeywords: 'Will Sampson Ten Bears The Outlaw Josey Wales Clint Eastwood',
    motionEffect: 'pan-left',
    colorFilter: 'color-warm',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-13',
    order: 13,
    title: 'Mở cánh cửa cho thế hệ diễn viên Bản địa (1983)',
    sceneType: 'image',
    durationSec: 17,
    voiceoverUrl: '/assets/aistudio/ws_scene_13.mp3',
    narrationText:
      'But off screen, Will was fighting a different battle. Native actors were rarely given Native roles, and he wanted that to change. So in 1983, he helped found the American Indian Registry for the Performing Arts. A door held open for the next generation.',
    translationText:
      'Nhưng ngoài đời thực, Will theo đuổi một cuộc chiến khác. Diễn viên bản địa hiếm khi được giao vai bản địa, và ông muốn thay đổi điều đó. Năm 1983, ông đồng sáng lập Hiệp hội Nghệ thuật Biểu diễn Người Mỹ Bản địa, mở rộng cánh cửa cho thế hệ mai sau.',
    visualPrompt: 'CẦN ẢNH TĨNH: Chân dung Will Sampson thập niên 1980 đầy tâm huyết vì cộng đồng bản địa',
    imagePrompt:
      '1983 archival portrait of Native American actor and activist Will Sampson speaking at a cultural arts gathering in Los Angeles, wearing a turquoise bolo tie and western blazer, warm lighting, 3:4 aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the 1983 portrait of Will Sampson in a western blazer and turquoise bolo tie -> [2-4s Story Action]: Preserving 100% exact facial identity, he speaks passionately with a warm, encouraging expression -> [4-6s Camera Control]: Slow documentary camera zoom-in.',
    archivalKeywords: 'Will Sampson 1980s actor portrait Poltergeist II',
    motionEffect: 'zoom-in',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-14',
    order: 14,
    title: 'Thẻ Chữ Đen: Ngày 03/06/1987 — Sự ra đi ở tuổi 53',
    sceneType: 'quote',
    durationSec: 10,
    voiceoverUrl: '/assets/aistudio/ws_scene_14.mp3',
    narrationText:
      'On June 3rd, 1987, after complications from a heart and lung transplant, Will Sampson passed away. He was only 53.',
    translationText:
      'Ngày 3 tháng 6 năm 1987, sau biến chứng từ ca ghép tim phổi, Will Sampson qua đời khi mới 53 tuổi.',
    visualPrompt: 'THẺ CHỮ ĐEN TỰ ĐỘNG: Không cần tải ảnh hay video',
    imagePrompt: 'Không cần tạo ảnh (Ứng dụng tự động dựng thẻ chữ trắng trên nền đen tuyền).',
    videoMotionPrompt: 'Không cần tạo video.',
    motionEffect: 'static',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: false,
  },
  {
    id: 'ws-15',
    order: 15,
    title: 'Di sản của Người Khổng Lồ Dịu Dàng từ Oklahoma',
    sceneType: 'video',
    durationSec: 17,
    voiceoverUrl: '/assets/aistudio/ws_scene_15.mp3',
    narrationText:
      "Cowboy, painter, actor, trailblazer. The quiet giant from Oklahoma left footprints that Hollywood still follows today. Do you remember Will Sampson as Chief Bromden, or as Ten Bears? Some legends never say much. They don't need to.",
    translationText:
      'Cao bồi, họa sĩ, diễn viên, người tiên phong. Người khổng lồ trầm lặng từ Oklahoma đã để lại những dấu chân mà Hollywood vẫn dõi theo hôm nay. Có những huyền thoại chẳng cần nói nhiều — bản thân họ đã là lời khẳng định.',
    visualPrompt: 'CẦN VIDEO: Chân dung huyền thoại Will Sampson mỉm cười hiền hậu trong ánh hoàng hôn',
    imagePrompt:
      'Timeless tribute portrait of Will Sampson smiling warmly under golden Oklahoma sunset light, long dark hair, classic western shirt, poignant documentary cinematography, 3:4 aspect ratio.',
    videoMotionPrompt:
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the golden-hour tribute portrait of Will Sampson, he looks into the camera with deep warmth and serenity -> [2-4s Story Action]: Preserving 100% exact facial identity, he gives a gentle, unforgettable nod of farewell -> [4-6s Camera Control]: Slow emotional dolly pull-back as warm sunset rays glow across the horizon.',
    archivalKeywords: 'Will Sampson tribute portrait Native American actor',
    motionEffect: 'zoom-in',
    colorFilter: 'color-warm',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
  },
  {
    id: 'ws-16',
    order: 16,
    title: 'Logo Kết Cố Định: LIFE LEGENDS (HM)',
    sceneType: 'outro',
    durationSec: 4,
    voiceoverUrl: '/assets/aistudio/ws_scene_16.mp3',
    narrationText: 'Life Legends. Their Legacy. Your Inspiration.',
    translationText: 'Huyền Thoại Cuộc Đời. Di sản của họ. Cảm hứng của bạn.',
    visualPrompt: 'LOGO KẾT CỐ ĐỊNH: Huy hiệu vàng LIFE LEGENDS — HM — THEIR LEGACY. YOUR INSPIRATION.',
    imagePrompt: 'Không cần tạo ảnh (Ứng dụng đã khóa cố định Logo LIFE LEGENDS - HM).',
    videoMotionPrompt: 'Không cần tạo video.',
    motionEffect: 'zoom-in',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: false,
  },
];

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
      "[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the uploaded reference frame of the older cowboy actor in a tan hat and brown leather vest sitting tall in the saddle on a golden buckskin horse beside a sunlit mountain lake, he gently pats the horse's neck with a warm, nostalgic smile -> [2-4s Story Action & Speech]: Preserving 100% exact facial identity from the reference image, the subject turns his gaze directly toward the camera and speaks soulfully with natural lip movement while the horse takes two slow, steady steps forward along the grassy shoreline -> [4-6s Camera Control & Climax]: Smooth Kling camera dolly push-in to a medium close-up as a gentle breeze stirs his tan cowboy hat and the horse's dark mane in golden-hour light.",
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
      '[Kling AI I2V - Lock Reference Face Identity] [0-2s Opening Beat]: Starting from the vintage 1959 black-and-white ranch porch reference photo, the father and his three sons stand proudly in classic western attire with natural breathing -> [2-4s Story Action & Interaction]: Preserving 100% exact facial features of all four subjects in the frame, they exchange a warm camaraderie-filled glance while the father places a steady paternal hand on his youngest son’s shoulder -> [4-6s Camera Control & Climax]: Slow nostalgic Kling camera dolly push-in toward the family portrait as warm afternoon sunlight filters through the wooden porch rafters.',
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
    title: 'Logo Kết Cố Định: LIFE LEGENDS (HM)',
    sceneType: 'outro',
    durationSec: 4,
    narrationText: 'Life Legends. Their Legacy. Your Inspiration.',
    translationText: 'Huyền Thoại Cuộc Đời. Di sản của họ. Cảm hứng của bạn.',
    visualPrompt: 'LOGO KẾT CỐ ĐỊNH: Huy hiệu vàng LIFE LEGENDS — HM — THEIR LEGACY. YOUR INSPIRATION.',
    imagePrompt: 'Không cần tạo ảnh (Ứng dụng đã khóa cố định Logo LIFE LEGENDS - HM).',
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
  'will-sampson': WILL_SAMPSON_SCENES,
  'lorne-greene': LORNE_GREENE_SCENES,
  'clayton-moore': CLAYTON_MOORE_SCENES,
  'yul-brynner': YUL_BRYNNER_SCENES,
};
