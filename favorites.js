// favorites.js
// Tanggung jawab: kelola daftar resep favorit user di localStorage.
// Data favorit hanya menyimpan ID (index resep di resep.json) - tidak butuh backend/database baru.

const STORAGE_KEY = 'resepin_favorites';

/** Baca daftar ID favorit dari localStorage. Aman jika localStorage tidak tersedia. */
export function getFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isInteger(id)) : [];
  } catch (err) {
    // localStorage penuh, dinonaktifkan browser, atau data korup -> anggap kosong
    return [];
  }
}

function saveFavorites(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    return true;
  } catch (err) {
    return false;
  }
}

/** Tambah resep ke favorit berdasarkan ID. Mencegah duplikasi. */
export function addFavorite(id) {
  const numId = Number(id);
  if (!Number.isInteger(numId)) return false;

  const current = getFavorites();
  if (current.includes(numId)) return true; // sudah ada, tidak perlu duplikat

  current.push(numId);
  return saveFavorites(current);
}

/** Hapus resep dari favorit berdasarkan ID. */
export function removeFavorite(id) {
  const numId = Number(id);
  const current = getFavorites();
  const next = current.filter((favId) => favId !== numId);
  return saveFavorites(next);
}

/** Cek apakah sebuah resep sudah difavoritkan. */
export function isFavorite(id) {
  const numId = Number(id);
  return getFavorites().includes(numId);
}

/** Toggle status favorit, kembalikan status baru (true = kini favorit). */
export function toggleFavorite(id) {
  if (isFavorite(id)) {
    removeFavorite(id);
    return false;
  }
  addFavorite(id);
  return true;
}

/** Jumlah total resep favorit -- dipakai untuk badge di navbar. */
export function getFavoritesCount() {
  return getFavorites().length;
}
