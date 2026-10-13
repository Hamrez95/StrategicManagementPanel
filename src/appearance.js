// Apply saved appearance before the first paint; no inline script or external service.
(() => {
  try {
    const saved=JSON.parse(localStorage.getItem('royesh-preferences-v1')) || {};
    const root=document.documentElement;
    if(['light','dark','system'].includes(saved.theme))root.dataset.theme=saved.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):saved.theme;
    if(saved.language==='en'){root.lang='en';root.dir='ltr';}
    if(saved.motion==='reduced')root.dataset.motion='reduced';
  } catch { /* The application uses session defaults when storage is unavailable. */ }
})();
