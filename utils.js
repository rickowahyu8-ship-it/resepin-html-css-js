// utils.js — helper kecil yang dipakai lintas modul.
// Dipisah dari 4 file inti (recipes/generator/favorites/app) supaya tidak duplikasi
// kode debounce/escape di banyak tempat, tanpa mengubah tanggung jawab masing-masing file.

/**
 * Debounce: menunda eksekusi fn sampai user berhenti memanggil selama `delay` ms.
 * Dipakai untuk search input supaya tidak filter 14.945 data di setiap ketikan.
 */
export function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Set teks secara aman (textContent), menghindari innerHTML untuk data dari database
 * sesuai aturan keamanan di spesifikasi.
 */
export function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? '';
}

/**
 * Validasi sederhana: hanya izinkan URL http/https sebelum dipakai sebagai href.
 */
export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Format angka besar jadi "1.2k" dsb untuk tampilan ringkas (Loves, dst). */
export function formatCount(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return String(n);
}

/** Kapital di awal tiap kata, untuk menampilkan Category ("ayam" -> "Ayam"). */
export function toTitleCase(str) {
  if (!str) return '';
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Tampilkan toast singkat di pojok bawah layar. */
let toastTimer = null;
export function showToast(message, duration = 2200) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
}
