import { useState } from 'react';
import { t } from '../locales/locale';

interface IconGalleryModalProps {
  open: boolean;
  onClose: () => void;
}

interface IconEntry {
  name: string;
  source: 'existing' | 'strict' | 'freeform' | 'candidate';
  svg: React.ReactNode;
}

const ICONS: IconEntry[] = [
  // ─── existing inline SVGs already in the app ────────────────────
  { name: 'folder', source: 'existing', svg: (
    <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/></svg>
  )},
  { name: 'moon', source: 'existing', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
  )},
  { name: 'sun', source: 'existing', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
  )},
  { name: 'gear', source: 'existing', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/></svg>
  )},
  { name: 'pencil', source: 'existing', svg: (
    <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor"><path d="M12.854.146a.5.5 0 00-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 000-.708l-3-3zM13.5 6.207L9.793 2.5 1 11.293V15h3.707L13.5 6.207z"/></svg>
  )},
  { name: 'search', source: 'existing', svg: (
    <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.1zM12 6.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z"/></svg>
  )},
  { name: 'group (people)', source: 'existing', svg: (
    <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor"><path d="M5.5 6a2 2 0 100-4 2 2 0 000 4zm5 0a2 2 0 100-4 2 2 0 000 4zM1 13c0-2.1 2-3.5 4.5-3.5S10 10.9 10 13v1H1v-1zm9 0c0-.8-.2-1.6-.6-2.2.4-.2.8-.3 1.3-.3 2 0 3.8 1.1 3.8 2.7V14H10v-1z"/></svg>
  )},
  { name: 'check', source: 'existing', svg: (
    <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor"><path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/></svg>
  )},
  { name: 'download', source: 'existing', svg: (
    <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor"><path d="M8 1a.5.5 0 01.5.5v7.793l2.646-2.647a.5.5 0 01.708.708l-3.5 3.5a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L7.5 9.293V1.5A.5.5 0 018 1zM2.5 12a.5.5 0 01.5.5V14h10v-1.5a.5.5 0 011 0V14a1 1 0 01-1 1H3a1 1 0 01-1-1v-1.5a.5.5 0 01.5-.5z"/></svg>
  )},
  { name: 'upload', source: 'existing', svg: (
    <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor"><path d="M8 1a.5.5 0 01.354.146l3.5 3.5a.5.5 0 01-.708.708L8.5 2.707V10.5a.5.5 0 01-1 0V2.707L4.854 5.354a.5.5 0 11-.708-.708l3.5-3.5A.5.5 0 018 1zM2.5 12a.5.5 0 01.5.5V14h10v-1.5a.5.5 0 011 0V14a1 1 0 01-1 1H3a1 1 0 01-1-1v-1.5a.5.5 0 01.5-.5z"/></svg>
  )},
  { name: 'link', source: 'existing', svg: (
    <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor"><path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/><path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z"/></svg>
  )},
  { name: 'github', source: 'existing', svg: (
    <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
  )},
  { name: 'hamburger', source: 'existing', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 5h10v3H3zm4 5h12v3H7zm-4 5h8v3H3z"/></svg>
  )},
  { name: 'bar chart', source: 'existing', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></svg>
  )},
  { name: 'wrench', source: 'existing', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>
  )},
  { name: 'triangle warn', source: 'existing', svg: (
    <svg viewBox="0 0 16 16" width="24" height="24"><path d="M8 1L15 14H1L8 1Z" fill="currentColor" stroke="none"/></svg>
  )},

  // ─── candidates for STRICT mode ─────────────────────────────────
  { name: 'lock closed', source: 'strict', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M18 8h-1V6A5 5 0 007 6v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM9 6a3 3 0 016 0v2H9V6zm3 11a2 2 0 110-4 2 2 0 010 4z"/></svg>
  )},
  { name: 'shield', source: 'strict', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2L4 5v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V5l-8-3z"/></svg>
  )},
  { name: 'shield check', source: 'strict', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L4 5v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V5l-8-3z"/><path d="M9 12l2 2 4-4"/></svg>
  )},
  { name: 'grid 3x3', source: 'strict', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
  )},
  { name: 'ruler', source: 'strict', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7L14 0 0 14l7 7zM5 11l2 2M9 7l2 2M13 3l2 2"/></svg>
  )},
  { name: 'target', source: 'strict', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
  )},
  { name: 'compass', source: 'strict', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
  )},
  { name: 'rail / track', source: 'strict', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2v20M18 2v20M4 6h16M4 12h16M4 18h16"/></svg>
  )},

  // ─── candidates for FREEFORM mode ───────────────────────────────
  { name: 'lock open', source: 'freeform', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M18 8h-1V6A5 5 0 007.2 4.8l1.9.6A3 3 0 0115 6v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-6 9a2 2 0 110-4 2 2 0 010 4z"/></svg>
  )},
  { name: 'brush', source: 'freeform', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34a1 1 0 00-1.41 0L9 12.25 11.75 15l8.96-8.96a1 1 0 000-1.41z"/></svg>
  )},
  { name: 'pencil ruler', source: 'freeform', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4-6 6H3v-4z"/><path d="M12.5 6.5l5 5L21 8l-5-5-3.5 3.5z"/></svg>
  )},
  { name: 'wand', source: 'freeform', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4l5 5-11 11-5-5z"/><path d="M20 4l-1-1M3 21l-1-1"/></svg>
  )},
  { name: 'sparkles', source: 'freeform', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5zM19 14l.8 2.4L22 17l-2.2.6L19 20l-.8-2.4L16 17l2.2-.6zM5 15l.6 1.8L7 17l-1.4.5L5 19l-.6-1.5L3 17l1.4-.2z"/></svg>
  )},
  { name: 'squiggle', source: 'freeform', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/></svg>
  )},
  { name: 'palette', source: 'freeform', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67a1.52 1.52 0 01-.36-.97c0-.83.67-1.5 1.5-1.5H17c2.76 0 5-2.24 5-5 0-4.97-4.49-9-10-9zM6.5 12a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3-4a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3 4a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
  )},
  { name: 'feather', source: 'freeform', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.24 12.24a6 6 0 00-8.49-8.49L5 10.5V19h8.5z"/><path d="M16 8L2 22M17.5 15H9"/></svg>
  )},

  // ─── extra candidates: general-purpose UI icons ─────────────────
  { name: 'plus', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
  )},
  { name: 'minus', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
  )},
  { name: 'x close', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  )},
  { name: 'trash', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
  )},
  { name: 'copy', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
  )},
  { name: 'sliders', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
  )},
  { name: 'layers', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
  )},
  { name: 'clock', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  )},
  { name: 'info', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  )},
  { name: 'star', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  )},
  { name: 'zap', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  )},
  { name: 'flame', source: 'candidate', svg: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2s4 4 4 9a4 4 0 01-8 0c0-2 1-3 1-3s-2 1-2 4a6 6 0 0012 0c0-7-7-10-7-10z"/></svg>
  )},
];

const SOURCE_LABELS: Record<IconEntry['source'], string> = {
  existing: 'Already used in app',
  strict: 'Candidate: STRICT mode',
  freeform: 'Candidate: FREEFORM mode',
  candidate: 'Extra candidate',
};

export default function IconGalleryModal({ open, onClose }: IconGalleryModalProps) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!open) return null;

  const groups: IconEntry['source'][] = ['existing', 'strict', 'freeform', 'candidate'];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal icon-gallery-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">{t('iconGallery.title')}</span>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>
        <div className="settings-body">
          {groups.map((group) => {
            const items = ICONS.filter((i) => i.source === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="icon-gallery-group">
                <div className="icon-gallery-group-label">{SOURCE_LABELS[group]}</div>
                <div className="icon-gallery-grid">
                  {items.map((icon) => (
                    <button
                      key={`${group}-${icon.name}`}
                      className={`icon-gallery-tile${copied === icon.name ? ' icon-gallery-tile--copied' : ''}`}
                      onClick={() => {
                        navigator.clipboard?.writeText(icon.name).catch(() => {});
                        setCopied(icon.name);
                        window.setTimeout(() => setCopied((c) => (c === icon.name ? null : c)), 1200);
                      }}
                      title={`${icon.name} (click to copy name)`}
                    >
                      <span className="icon-gallery-glyph">{icon.svg}</span>
                      <span className="icon-gallery-name">{icon.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
