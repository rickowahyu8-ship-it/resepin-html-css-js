// recipes.js
// Tanggung jawab: memuat resep.json (sekali saja), menormalisasi data,
// dan menyediakan fungsi search / filter / sort di atas data yang sudah di-cache.

const DATA_URL = 'data/resep.json';

let recipesCache = null;   // array resep hasil normalisasi, disimpan di memory
let loadPromise = null;    // mencegah fetch dobel kalau dipanggil bersamaan

/**
 * Ubah satu record mentah dari JSON menjadi bentuk yang aman dipakai UI.
 * Field kosong/tidak konsisten (contoh: "Title Cleaned" kosong) di-fallback,
 * bukan bikin aplikasi crash.
 */
function normalizeRecipe(raw, index) {
  const title = (raw.Title || '').toString().trim() || 'Resep Tanpa Nama';
  const titleCleanedRaw = (raw['Title Cleaned'] || '').toString().trim();
  const category = (raw.Category || 'lainnya').toString().trim().toLowerCase() || 'lainnya';
  const loves = Number.isFinite(raw.Loves) ? raw.Loves : 0;
  const totalIngredients = Number.isFinite(raw['Total Ingredients']) ? raw['Total Ingredients'] : null;
  const totalSteps = Number.isFinite(raw['Total Steps']) ? raw['Total Steps'] : null;

  return {
    id: index, // ID stabil: index posisi di resep.json (data tidak pernah diubah urutannya)
    title,
    titleCleaned: titleCleanedRaw || title.toLowerCase(),
    ingredientsRaw: (raw.Ingredients || '').toString(),
    ingredientsCleaned: (raw['Ingredients Cleaned'] || '').toString().toLowerCase(),
    stepsRaw: (raw.Steps || '').toString(),
    loves,
    url: (raw.URL || '').toString(),
    category,
    totalIngredients,
    totalSteps,
  };
}

/**
 * Muat database resep. Fetch hanya terjadi sekali (cache di memory),
 * pemanggilan berikutnya langsung pakai cache.
 */
export async function loadRecipes() {
  if (recipesCache) return recipesCache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    let response;
    try {
      response = await fetch(DATA_URL);
    } catch (err) {
      throw new Error('Gagal memuat database resep. Periksa koneksi atau jalankan lewat local server (bukan file://).');
    }

    if (!response.ok) {
      throw new Error(`Gagal memuat database resep (status ${response.status}).`);
    }

    let rawData;
    try {
      rawData = await response.json();
    } catch (err) {
      throw new Error('Format database resep tidak valid (JSON rusak).');
    }

    if (!Array.isArray(rawData) || rawData.length === 0) {
      throw new Error('Database resep kosong.');
    }

    recipesCache = rawData.map((item, index) => {
      try {
        return normalizeRecipe(item, index);
      } catch (err) {
        // satu record rusak tidak boleh menjatuhkan seluruh aplikasi
        return normalizeRecipe({}, index);
      }
    });

    return recipesCache;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null; // izinkan retry di percobaan berikutnya
    throw err;
  }
}

/** Ambil seluruh resep dari cache (harus dipanggil setelah loadRecipes selesai). */
export function getAllRecipes() {
  return recipesCache || [];
}

/** Cari satu resep berdasarkan ID (index array). */
export function getRecipeById(id) {
  const numId = Number(id);
  if (!recipesCache || Number.isNaN(numId)) return null;
  return recipesCache[numId] || null;
}

/** Daftar kategori unik + jumlah resepnya, diambil dinamis dari data (tidak hardcode). */
export function getCategories() {
  const counts = new Map();
  for (const r of getAllRecipes()) {
    counts.set(r.category, (counts.get(r.category) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Pencarian case-insensitive terhadap Title, Title Cleaned, Ingredients,
 * Ingredients Cleaned, dan Category.
 */
export function searchRecipes(query, list = getAllRecipes()) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return list;

  return list.filter((r) => (
    r.title.toLowerCase().includes(q) ||
    r.titleCleaned.includes(q) ||
    r.ingredientsRaw.toLowerCase().includes(q) ||
    r.ingredientsCleaned.includes(q) ||
    r.category.includes(q)
  ));
}

/** Filter berdasarkan kategori. Kategori kosong/"" berarti tampilkan semua. */
export function filterByCategory(list, category) {
  if (!category) return list;
  const cat = category.toLowerCase();
  return list.filter((r) => r.category === cat);
}

/**
 * Urutkan resep. mode: 'default' | 'popular' | 'az' | 'za' | 'match'
 * 'match' mengasumsikan tiap item punya properti matchPercentage (dari generator.js)
 * dan memakai Loves sebagai secondary ranking jika persentase sama.
 */
export function sortRecipes(list, mode = 'default') {
  const arr = [...list];
  switch (mode) {
    case 'popular':
      return arr.sort((a, b) => b.loves - a.loves);
    case 'az':
      return arr.sort((a, b) => a.title.localeCompare(b.title, 'id'));
    case 'za':
      return arr.sort((a, b) => b.title.localeCompare(a.title, 'id'));
    case 'match':
      return arr.sort((a, b) => {
        const diff = (b.matchPercentage || 0) - (a.matchPercentage || 0);
        return diff !== 0 ? diff : b.loves - a.loves;
      });
    case 'default':
    default:
      return arr.sort((a, b) => a.id - b.id);
  }
}

/** Resep populer berdasarkan Loves tertinggi (data asli, tidak dikarang). */
export function getPopularRecipes(limit = 8) {
  return sortRecipes(getAllRecipes(), 'popular').slice(0, limit);
}

/**
 * Parsing "Ingredients" (dipisah "--") menjadi array bahan yang rapi.
 * Aman terhadap variasi: strip whitespace, buang elemen kosong/'--' berlebih.
 */
export function parseIngredients(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split('--')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parsing "Steps" (format "1) ... 2) ...") menjadi array langkah tanpa nomor.
 * Regex men-split di setiap penanda "angka)" sehingga tahan terhadap newline
 * yang tidak konsisten.
 */
export function parseSteps(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/\d+\)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
