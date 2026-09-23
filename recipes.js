// recipes.js
// Tanggung jawab: mengambil data resep dari Hugging Face Dataset API
// (bukan lagi data/resep.json), menormalisasi, cache di memory, dan
// menyediakan fungsi bantu untuk mengambil/mengurutkan data.

const API_BASE = 'https://datasets-server.huggingface.co/rows';
const DATASET = 'LorthGyu/indonesian-recipes';
const PAGE_LENGTH = 100; // sesuai batas maksimal API per request

let recipesCache = null;
let loadPromise = null;

/**
 * Ambil satu "halaman" data mentah dari API Hugging Face.
 * Fungsi ini murni tugas jaringan -- tidak melakukan normalisasi apa pun,
 * supaya mudah dites/dipahami terpisah dari logic pengolahan data.
 */
async function fetchRecipes(offset = 0, length = PAGE_LENGTH) {
  const url = `${API_BASE}?dataset=${encodeURIComponent(DATASET)}&config=default&split=train&offset=${offset}&length=${length}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Gagal mengambil data dari API (status ${response.status}).`);
  }

  return response.json();
}

/**
 * Ubah satu baris data mentah dari API menjadi bentuk yang dipakai UI.
 * Field yang tidak tersedia di API (Loves, URL) diberi nilai kosong/0,
 * bukan dikarang.
 */
function normalizeRecipe(raw) {
  const ingredientsFull = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  const stepsFull = Array.isArray(raw.steps) ? raw.steps : [];

  return {
    id: raw.id,
    title: raw.name || 'Resep Tanpa Nama',
    titleCleaned: (raw.name || '').toLowerCase(),
    category: (raw.category || 'lainnya').toLowerCase(),
    ingredientsFull,                                   // teks asli lengkap, buat ditampilkan di detail
    ingredientsCore: ingredientsFull.flatMap(extractCoreIngredient), // "inti" bahan, buat matching & filter
    stepsFull,
    loves: 0,          // API tidak menyediakan field ini -- bukan dikarang, memang tidak ada
    url: '',           // API tidak menyediakan sumber resep
    difficulty: raw.difficulty || '',
    timeMinutes: Number.isFinite(raw.time_minutes) ? raw.time_minutes : null,
    region: raw.region || '',
    totalIngredients: ingredientsFull.length,
    totalSteps: stepsFull.length,
  };
}

/**
 * Ambil "inti" nama bahan dari satu baris teks bahan API. Contoh:
 *   "500 gram singkong, kupas dan cuci bersih" -> ["singkong"]
 *   "bumbu halus: 6 bawang merah, 4 bawang putih" -> ["bawang merah", "bawang putih"]
 *
 * Caranya:
 * 1. Kalau baris berformat "label: bahan1, bahan2, ..." (mis. "bumbu halus:",
 *    "pelengkap:"), pecah bagian setelah titik dua per koma -- baris ini
 *    memang berisi beberapa bahan sekaligus dalam satu elemen array.
 * 2. Baris biasa cukup ambil bagian SEBELUM koma pertama saja -- karena teks
 *    setelah koma di baris biasa umumnya instruksi ("kupas dan cuci bersih"),
 *    bukan bahan lain.
 * 3. Buang angka/pecahan/satuan takaran umum & isi dalam kurung di depannya.
 *
 * Ini heuristik sederhana (bukan parser sempurna) -- teks lengkap aslinya
 * tetap disimpan utuh di `ingredientsFull` untuk ditampilkan ke user.
 */
function extractCoreIngredient(text) {
  if (!text) return [];

  const parenPattern = /\([^)]*\)/g;
  const unitPattern = /^\s*\d+(\/\d+|[.,]\d+)?\s*(gram|kg|ml|liter|sdm|sdt|sendok\s+makan|sendok\s+teh|sendok|gelas|butir|buah|batang|lembar|siung|cm|ekor|potong|ruas|bungkus|papan|helai|ikat|genggam|biji|iris|ons)?\s*/i;
  const clean = (s) => s.replace(parenPattern, '').replace(unitPattern, '').trim().toLowerCase();

  const colonIndex = text.indexOf(':');
  const hasLabel = colonIndex !== -1 && colonIndex < 20; // batas 20 char supaya tidak salah kena kalimat panjang

  if (hasLabel) {
    return text.slice(colonIndex + 1).split(',').map(clean).filter(Boolean);
  }

  const core = clean(text.split(',')[0]);
  return core ? [core] : [];
}

/**
 * Muat SELURUH database resep dari API (bukan per halaman UI), lalu cache
 * di memory. Dilakukan sekali saja saat aplikasi start -- fitur generator
 * butuh membandingkan bahan ke seluruh data supaya persentase kecocokan
 * dan urutannya akurat, bukan cuma dari satu halaman API.
 */
export async function loadRecipes() {
  if (recipesCache) return recipesCache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    let offset = 0;
    let total = Infinity;
    const allRows = [];

    while (offset < total) {
      let data;
      try {
        data = await fetchRecipes(offset, PAGE_LENGTH);
      } catch (err) {
        throw new Error('Gagal memuat resep. Silakan coba lagi.');
      }

      if (!data || !Array.isArray(data.rows)) {
        throw new Error('Format data dari API tidak sesuai dugaan.');
      }

      total = Number.isFinite(data.num_rows_total) ? data.num_rows_total : data.rows.length;
      for (const item of data.rows) {
        if (item && item.row) allRows.push(item.row);
      }
      offset += PAGE_LENGTH;
    }

    if (allRows.length === 0) {
      throw new Error('Database resep kosong.');
    }

    recipesCache = allRows.map((raw) => {
      try {
        return normalizeRecipe(raw);
      } catch (err) {
        return normalizeRecipe({}); // satu baris rusak tidak boleh menjatuhkan seluruh aplikasi
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

/** Cari satu resep berdasarkan ID asli dari API. */
export function getRecipeById(id) {
  const numId = Number(id);
  if (!recipesCache) return null;
  return recipesCache.find((r) => r.id === numId) || null;
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
 * Urutkan resep. mode: 'default' | 'az' | 'za' | 'match'
 * 'match' mengasumsikan tiap item punya properti matchPercentage (dari generator.js).
 * Loves tidak lagi dipakai sebagai secondary ranking karena API tidak menyediakannya --
 * secondary ranking-nya jadi urutan ID asli (stabil, bukan dikarang).
 */
export function sortRecipes(list, mode = 'default') {
  const arr = [...list];
  switch (mode) {
    case 'az':
      return arr.sort((a, b) => a.title.localeCompare(b.title, 'id'));
    case 'za':
      return arr.sort((a, b) => b.title.localeCompare(a.title, 'id'));
    case 'match':
      return arr.sort((a, b) => {
        const diff = (b.matchPercentage || 0) - (a.matchPercentage || 0);
        return diff !== 0 ? diff : a.id - b.id;
      });
    case 'default':
    default:
      return arr.sort((a, b) => a.id - b.id);
  }
}

let ingredientTokensCache = null;

/**
 * Daftar token bahan unik (versi "inti", lihat extractCoreIngredient) dari
 * seluruh database, diurutkan dari yang paling sering muncul. Dipakai
 * sebagai sumber data untuk filter bahan (dropdown/checkbox) di UI.
 */
export function getIngredientTokens() {
  if (ingredientTokensCache) return ingredientTokensCache;

  const counts = new Map();
  for (const r of getAllRecipes()) {
    for (const token of r.ingredientsCore) {
      if (!token) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  ingredientTokensCache = Array.from(counts.entries())
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token, 'id'));

  return ingredientTokensCache;
}
