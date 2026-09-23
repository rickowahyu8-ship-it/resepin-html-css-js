// utils.js
// Tanggung jawab: fungsi bantu kecil yang dipakai lintas modul (URL aman, toast, format teks).

/** Hanya izinkan URL http/https supaya tidak bisa disisipi "javascript:" dsb. */
export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

let toastTimer = null;

/** Tampilkan notifikasi singkat di elemen #toast. */
export function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, duration);
}

/** "nasi goreng" -> "Nasi Goreng" */
export function toTitleCase(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}
