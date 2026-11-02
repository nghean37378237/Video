import { ProjectSettings, StoryScene } from '../types';

export type PagePostLanguage = 'vi' | 'en' | 'bilingual';
export type PageTitleStyle = 'documentary' | 'viral-hook' | 'legacy-quote';

export interface GeneratedPagePost {
  subjectName: string;
  titles: Record<PageTitleStyle, string>;
  summaryText: string;
  wordCount: number;
  hashtags: string;
  fullPostText: string;
}

function countWords(text: string): number {
  const cleaned = text
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(' ').length;
}

function extractSubjectName(projectTitle: string, scenes: StoryScene[]): string {
  const cleanedTitle = (projectTitle || '').trim();
  if (cleanedTitle) {
    // Extract primary subject name before separators like "—", "-", ":"
    const parts = cleanedTitle.split(/\s*[—–\-:|]\s*/);
    if (parts[0] && parts[0].trim().length >= 2) {
      return parts[0].trim();
    }
    return cleanedTitle;
  }
  const firstScene = scenes.find((s) => s.sceneType !== 'outro');
  if (firstScene?.title) {
    return firstScene.title.replace(/^#?\d+\s*[-:.]?\s*/, '').trim();
  }
  return 'Huyền Thoại Cuộc Đời';
}

function buildSubjectHashtag(subjectName: string): string {
  const ascii = subjectName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]/g, '');
  return ascii ? `#${ascii}` : '#LifeLegends';
}

function cleanSentence(text: string): string {
  const trimmed = (text || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  if (/[.!?…]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

/**
 * Synthesizes a 200-300 word documentary summary from the project's scenes
 * in Vietnamese, English, or Bilingual mode.
 */
export function generateVideoPagePost(
  scenes: StoryScene[],
  settings: ProjectSettings,
  lang: PagePostLanguage = 'vi',
  titleStyle: PageTitleStyle = 'documentary'
): GeneratedPagePost {
  const subjectName = extractSubjectName(settings.projectTitle, scenes);
  const contentScenes = scenes.filter((s) => s.sceneType !== 'outro');

  const viSentences = contentScenes
    .map((s) => cleanSentence(s.translationText || s.narrationText || ''))
    .filter(Boolean);

  const enSentences = contentScenes
    .map((s) => cleanSentence(s.narrationText || s.translationText || ''))
    .filter(Boolean);

  const quoteScene = contentScenes.find((s) => s.sceneType === 'quote');
  const highlightQuoteVi = quoteScene
    ? (quoteScene.translationText || quoteScene.narrationText || '').trim()
    : viSentences[Math.floor(viSentences.length / 2)] || '';
  const highlightQuoteEn = quoteScene
    ? (quoteScene.narrationText || quoteScene.translationText || '').trim()
    : enSentences[Math.floor(enSentences.length / 2)] || '';

  // Generate 3 distinct title options
  const titlesVi: Record<PageTitleStyle, string> = {
    documentary: `${subjectName.toUpperCase()} — Cuộc Đời, Góc Khuất Và Di Sản Bất Tử Còn Mãi Với Thời Gian | LIFE LEGENDS`,
    'viral-hook': `Phía Sau Ánh Hào Quang Của ${subjectName}: Câu Chuyện Cuộc Đời Khiến Hàng Triệu Khán Giả Lặng Người`,
    'legacy-quote': highlightQuoteVi
      ? `"${highlightQuoteVi.replace(/^["“]|["”]$/g, '')}" — Hành Trình Phi Thường Của Huyền Thoại ${subjectName}`
      : `${subjectName}: Hành Trình Từ Gian Khó Đến Tượng Đài Huyền Thoại Không Thể Thay Thế`,
  };

  const titlesEn: Record<PageTitleStyle, string> = {
    documentary: `${subjectName.toUpperCase()} — The Untold Story, Struggles, and Immortal Legacy | LIFE LEGENDS`,
    'viral-hook': `Behind the Legend of ${subjectName}: The Extraordinary Journey That Moved Millions`,
    'legacy-quote': highlightQuoteEn
      ? `"${highlightQuoteEn.replace(/^["“]|["”]$/g, '')}" — Remembering the Unforgettable Legacy of ${subjectName}`
      : `${subjectName}: From Humble Beginnings to an Immortal Cultural Icon`,
  };

  const titlesBilingual: Record<PageTitleStyle, string> = {
    documentary: `${subjectName.toUpperCase()} — Hành Trình Huyền Thoại & Di Sản Bất Tử | The Immortal Legacy (${settings.channelTitle || 'LIFE LEGENDS'})`,
    'viral-hook': `Câu Chuyện Chưa Kể Về ${subjectName} — The Untold Documentary Story That Touched Millions`,
    'legacy-quote': `${subjectName}: Tượng Đài Bất Tử Của Lòng Kiêu Hãnh & Nghị Lực | Their Legacy, Your Inspiration`,
  };

  const titles =
    lang === 'en' ? titlesEn : lang === 'bilingual' ? titlesBilingual : titlesVi;

  let summaryText = '';

  if (lang === 'vi') {
    const third = Math.max(1, Math.ceil(viSentences.length / 3));
    const part1Core = viSentences.slice(0, third).join(' ');
    const part2Core = viSentences.slice(third, third * 2).join(' ');
    const part3Core = viSentences.slice(third * 2).join(' ');

    const introParagraph = `Trong dòng chảy của lịch sử và nghệ thuật, có những con người mà sự xuất hiện của họ không chỉ đơn thuần là một cái tên, mà đã trở thành biểu tượng sống động cho nghị lực, tài năng và phẩm giá. Video tài liệu hôm nay trên kênh ${settings.channelTitle || 'LIFE LEGENDS'} sẽ đưa chúng ta ngược dòng thời gian để lắng nghe trọn vẹn câu chuyện cuộc đời của ${subjectName}. ${part1Core}`;

    const bodyParagraph = `Đằng sau những khoảnh khắc được công chúng nhớ đến là cả một hành trình bền bỉ vượt qua định kiến, thử thách và những ngã rẽ khắc nghiệt của số phận. ${part2Core} Chính trong những giai đoạn cam go nhất ấy, bản lĩnh kiên cường và chiều sâu tâm hồn của ${subjectName} lại càng tỏa sáng mạnh mẽ hơn bao giờ hết, để lại dấu ấn không thể phai mờ trong lòng nhiều thế hệ.`;

    const conclusionParagraph = `${part3Core} Dù thời gian có trôi qua, di sản và tinh thần mà ${subjectName} để lại vẫn luôn là nguồn cảm hứng lớn lao cho tất cả chúng ta về lòng dũng cảm, sự tử tế và khát vọng sống trọn vẹn với lý tưởng của mình. Hãy cùng xem hết video, để lại cảm nhận của bạn ở phần bình luận bên dưới và chia sẻ thước phim tư liệu ý nghĩa này đến những người cùng yêu mến các huyền thoại sống.`;

    summaryText = [introParagraph, bodyParagraph, conclusionParagraph]
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .join('\n\n');

    // Calibrate strictly into the 200 - 300 words range
    let wc = countWords(summaryText);
    if (wc < 205) {
      const expansion = `\n\nMỗi thước phim và bức ảnh tư liệu trong video đều tái hiện chân thực từng cột mốc đáng nhớ nhất của ${subjectName}, nhắc nhở chúng ta rằng một huyền thoại thực thụ không bao giờ khuất phục trước nghịch cảnh và luôn sống mãi trong ký ức nhân loại.`;
      summaryText = `${summaryText}${expansion}`;
      wc = countWords(summaryText);
    }
    if (wc > 295) {
      // Trim excess words from the final reflection while preserving full sentences
      const paragraphs = summaryText.split('\n\n');
      if (paragraphs.length >= 3) {
        paragraphs[2] = `${part3Core} Di sản của ${subjectName} vẫn luôn là nguồn cảm hứng bất tận về nghị lực và lòng nhân ái. Hãy cùng xem hết video và chia sẻ cảm nhận của bạn ở phần bình luận bên dưới.`;
        summaryText = paragraphs.join('\n\n');
      }
    }
  } else if (lang === 'en') {
    const third = Math.max(1, Math.ceil(enSentences.length / 3));
    const part1Core = enSentences.slice(0, third).join(' ');
    const part2Core = enSentences.slice(third, third * 2).join(' ');
    const part3Core = enSentences.slice(third * 2).join(' ');

    const introParagraph = `Throughout history, certain extraordinary individuals transcend their era to become timeless symbols of resilience, authenticity, and quiet greatness. In today's documentary tribute on ${settings.channelTitle || 'LIFE LEGENDS'}, we look back at the remarkable life and enduring journey of ${subjectName}. ${part1Core}`;

    const bodyParagraph = `Behind every iconic moment remembered by the world lies a deeper story of perseverance through adversity, unspoken sacrifices, and defining turning points. ${part2Core} Even when confronted with overwhelming challenges, ${subjectName} stood firm with unwavering dignity and purpose, transforming personal struggles into an unforgettable cultural legacy.`;

    const conclusionParagraph = `${part3Core} Decades later, the spirit, wisdom, and humanity of ${subjectName} continue to inspire generations around the globe, reminding us that true greatness is measured by the lives we touch and the courage we show when it matters most. Watch the full documentary video, share your thoughts in the comments below, and follow our page for more inspiring biographical tributes.`;

    summaryText = [introParagraph, bodyParagraph, conclusionParagraph]
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .join('\n\n');

    let wc = countWords(summaryText);
    if (wc < 205) {
      const expansion = `\n\nEvery archival frame and spoken reflection in this tribute honors the profound chapters that shaped ${subjectName} into an unforgettable legend whose voice, character, and integrity will never be forgotten.`;
      summaryText = `${summaryText}${expansion}`;
      wc = countWords(summaryText);
    }
    if (wc > 295) {
      const paragraphs = summaryText.split('\n\n');
      if (paragraphs.length >= 3) {
        paragraphs[2] = `${part3Core} Today, the legacy of ${subjectName} remains an enduring inspiration for generations. Watch the full tribute video and share your reflections in the comments below.`;
        summaryText = paragraphs.join('\n\n');
      }
    }
  } else {
    // Bilingual VI + EN (calibrated ~240-285 words total)
    const coreVi = viSentences.slice(0, 4).join(' ');
    const tailVi = viSentences.slice(4).join(' ');
    const coreEn = enSentences.slice(0, 4).join(' ');
    const tailEn = enSentences.slice(4).join(' ');

    const viBlock = `[TIẾNG VIỆT] Hành trình cuộc đời và di sản bất tử của ${subjectName} là minh chứng sống động cho bản lĩnh, nghị lực và chiều sâu tâm hồn vượt thời gian. ${coreVi} ${tailVi} Dù năm tháng trôi qua, câu chuyện về ${subjectName} trên kênh ${settings.channelTitle || 'LIFE LEGENDS'} vẫn luôn để lại niềm xúc động mạnh mẽ và nguồn cảm hứng sâu sắc cho hàng triệu khán giả.`;

    const enBlock = `[ENGLISH] The extraordinary life and timeless legacy of ${subjectName} stand as a powerful testament to resilience, authenticity, and human dignity. ${coreEn} ${tailEn} Watch the full tribute video below, share your thoughts in the comments, and follow ${settings.channelTitle || 'LIFE LEGENDS'} for more unforgettable biographical stories.`;

    summaryText = `${viBlock.replace(/\s+/g, ' ').trim()}\n\n${enBlock.replace(/\s+/g, ' ').trim()}`;
  }

  const subjectTag = buildSubjectHashtag(subjectName);
  const hashtags =
    lang === 'en'
      ? `${subjectTag} #LifeLegends #Biography #Documentary #UntoldStory #HistoryLegends #Inspiration #Tribute`
      : `${subjectTag} #LifeLegends #HuyenThoaiCuocDoi #TieuSuNhanVat #PhimTaiLieu #CauChuyenCuocDoi #TruyenCamHung #DienAnh`;

  const selectedTitle = titles[titleStyle];
  const fullPostText = `${selectedTitle}\n\n${summaryText}\n\n${hashtags}`;

  return {
    subjectName,
    titles,
    summaryText,
    wordCount: countWords(summaryText),
    hashtags,
    fullPostText,
  };
}
