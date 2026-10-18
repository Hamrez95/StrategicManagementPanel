export type MascotMood = 'welcome' | 'thinking' | 'guidance' | 'correct' | 'retry' | 'celebration';

const descriptions: Record<MascotMood, string> = {
  welcome: 'همراه استراتینو در حال خوشامدگویی',
  thinking: 'همراه استراتینو در حال فکرکردن',
  guidance: 'همراه استراتینو در حال راهنمایی',
  correct: 'همراه استراتینو در حال تأیید پاسخ درست',
  retry: 'همراه استراتینو در حال تشویق به تلاش دوباره',
  celebration: 'همراه استراتینو در حال جشن پایان تمرین',
};

export function AcademyMascot({
  mood = 'welcome',
  className = '',
}: {
  mood?: MascotMood;
  className?: string;
}) {
  return (
    <img
      className={`academy-mascot ${className}`}
      data-mood={mood}
      src={`/assets/academy/mascot/${mood}.svg`}
      alt={descriptions[mood]}
      width={320}
      height={480}
      decoding="async"
    />
  );
}
