// generator.js
// Tanggung jawab: satu-satunya logic inti aplikasi -- mencocokkan bahan yang
// dimasukkan pengguna dengan `Ingredients Cleaned` tiap resep di database,
// menghitung persentase kecocokan, lalu mengurutkan hasilnya.

import { getAllRecipes, sortRecipes } from './recipes.js';

/**
 * Normalisasi satu string bahan: lowercase, trim, dan rapikan spasi ganda
 * menjadi satu spasi (mengantisipasi input pengguna yang tidak rapi).
 */
export function normalizeIngredient(text) {
  if (!text || typeof text !== 'string') return '';
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Pecah teks/daftar input bahan pengguna menjadi array bahan yang sudah
 * dinormalisasi, tanpa duplikat dan tanpa entri kosong.
 */
export function parseUserIngredients(rawIngredients) {
  const list = Array.isArray(rawIngredients)
    ? rawIngredients
    : (rawIngredients || '').split(',');

  const normalized = list
    .map(normalizeIngredient)
    .filter((item) => item.length > 0);

  return Array.from(new Set(normalized));
}

/**
 * Hitung kecocokan satu resep terhadap daftar bahan pengguna.
 * Dibandingkan ke `Ingredients Cleaned` (bukan `Ingredients` mentah).
 * Pencocokan substring dua arah agar "ayam" tetap cocok dengan data
 * "ayam kampung potong" tanpa mengarang bahan yang tidak ada di database.
 */
export function calculateMatch(userIngredients, recipe) {
  const recipeIngredients = (recipe.ingredientsCleaned || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (recipeIngredients.length === 0 || userIngredients.length === 0) {
    return {
      matchedCount: 0,
      totalCount: recipeIngredients.length,
      matchPercentage: 0,
      matchedIngredients: [],
      missingIngredients: recipeIngredients,
    };
  }

  const matchedIngredients = [];
  const missingIngredients = [];

  for (const ingredient of recipeIngredients) {
    const isMatch = userIngredients.some(
      (u) => ingredient.includes(u) || u.includes(ingredient)
    );
    if (isMatch) matchedIngredients.push(ingredient);
    else missingIngredients.push(ingredient);
  }

  const matchPercentage = Math.round(
    (matchedIngredients.length / recipeIngredients.length) * 100
  );

  return {
    matchedCount: matchedIngredients.length,
    totalCount: recipeIngredients.length,
    matchPercentage,
    matchedIngredients,
    missingIngredients,
  };
}

/**
 * Fungsi utama: dari input bahan pengguna, hasilkan daftar resep dari
 * `resep.json` yang punya kecocokan > 0%, terurut dari persentase
 * tertinggi. Jika persentase sama, `Loves` dipakai sebagai secondary
 * ranking (bukan untuk section populer terpisah -- sesuai aturan).
 * Resep tanpa kecocokan sama sekali tidak disertakan dalam hasil.
 */
export function generateRecipes(rawIngredients, options = {}) {
  const { limit = 30 } = options;

  const userIngredients = parseUserIngredients(rawIngredients);
  if (userIngredients.length === 0) return [];

  const scored = [];
  for (const recipe of getAllRecipes()) {
    const match = calculateMatch(userIngredients, recipe);
    if (match.matchedCount > 0) {
      scored.push({ ...recipe, ...match });
    }
  }

  const sorted = sortRecipes(scored, 'match');
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
}
