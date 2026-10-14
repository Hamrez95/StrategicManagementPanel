// Apply the last device or account presentation preferences before first paint.
try {
  const saved = JSON.parse(
    localStorage.getItem('stratino-preferences-v1') ||
      localStorage.getItem('royesh-preferences-v1') ||
      '{}',
  );
  const dark =
    saved?.theme === 'dark' ||
    (saved?.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = saved?.theme === 'light' ? 'light' : dark ? 'dark' : 'light';
  document.documentElement.dataset.motion = saved?.motion === 'reduced' ? 'reduced' : 'auto';
  document.documentElement.lang = saved?.language === 'en' ? 'en' : 'fa';
  document.documentElement.dir = saved?.language === 'en' ? 'ltr' : 'rtl';
} catch {
  document.documentElement.dataset.theme = 'light';
  document.documentElement.lang = 'fa';
  document.documentElement.dir = 'rtl';
}
