// Set only presentation before first paint. Do not touch project records or language.
try {
  const saved = JSON.parse(localStorage.getItem('royesh-preferences-v1') || '{}');
  const dark =
    saved?.theme === 'dark' ||
    (saved?.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.motion = saved?.motion === 'reduced' ? 'reduced' : 'auto';
} catch {
  document.documentElement.dataset.theme = 'light';
}
