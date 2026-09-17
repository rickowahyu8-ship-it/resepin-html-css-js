// app.js
// Tanggung jawab: inisialisasi aplikasi, kelola input bahan (chip + picker),
// jalankan generator, pagination hasil, favorit, dark mode, dan seluruh event listener.

import { loadRecipes, getRecipeById, getIngredientTokens, parseIngredients, parseSteps } from './recipes.js';
import { normalizeIngredient, generateRecipes } from './generator.js';
import { getFavorites, isFavorite, toggleFavorite, getFavoritesCount } from './favorites.js';
import { isSafeUrl, showToast, toTitleCase } from './utils.js';

const PAGE_SIZE = 12;
const PICKER_MAX_SHOWN = 40; // batasi jumlah opsi yang dirender di panel picker demi performa

// ---- State ----
let ingredients = [];       // bahan yang sudah ditambahkan user (chip)
let currentResults = [];    // seluruh hasil generate (belum dipotong per halaman)
let currentPage = 1;

// ---- Referensi elemen DOM ----
const el = (id) => document.getElementById(id);

const themeToggle = el('themeToggle');
const favoritesNavBtn = el('favoritesNavBtn');
const favoritesCountBadge = el('favoritesCountBadge');

const ingredientInput = el('ingredientInput');
const addIngredientBtn = el('addIngredientBtn');
const ingredientChips = el('ingredientChips');
const generateBtn = el('generateBtn');
const generatorMessage = el('generatorMessage');

const pickerToggleBtn = el('pickerToggleBtn');
const pickerPanel = el('pickerPanel');
const pickerSearch = el('pickerSearch');
const pickerList = el('pickerList');

const resultsSection = el('resultsSection');
const resultsCount = el('resultsCount');
const resultsGrid = el('resultsGrid');
const pagination = el('pagination');
const paginationInfo = el('paginationInfo');
const prevPageBtn = el('prevPageBtn');
const nextPageBtn = el('nextPageBtn');

const detailModal = el('detailModal');
const closeDetailModal = el('closeDetailModal');
const detailModalTitle = el('detailModalTitle');
const detailModalBody = el('detailModalBody');

const favoritesModal = el('favoritesModal');
const closeFavoritesModal = el('closeFavoritesModal');
const favoritesGrid = el('favoritesGrid');

// ==========================================================================
// CHIP BAHAN (input manual + dipilih dari picker, dua-duanya masuk ke sini)
// ==========================================================================

function renderChips() {
  ingredientChips.innerHTML = '';

  if (ingredients.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chips-empty';
    empty.textContent = 'Belum ada bahan ditambahkan.';
    ingredientChips.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  ingredients.forEach((ingredient, index) => {
    const chip = document.createElement('span');
    chip.className = 'chip';

    const label = document.createElement('span');
    label.textContent = ingredient; // textContent -> aman dari input pengguna

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'chip-remove';
    removeBtn.textContent = '\u00d7';
    removeBtn.setAttribute('aria-label', `Hapus bahan ${ingredient}`);
    removeBtn.dataset.index = index;

    chip.append(label, removeBtn);
    fragment.appendChild(chip);
  });
  ingredientChips.appendChild(fragment);
}

function addIngredient(value) {
  const normalized = normalizeIngredient(value);
  if (!normalized) return false;

  if (ingredients.includes(normalized)) {
    showToast(`"${normalized}" sudah ada di daftar bahan.`);
    return false;
  }

  ingredients.push(normalized);
  renderChips();
  clearGeneratorMessage();
  return true;
}

function removeIngredientAt(index) {
  ingredients.splice(index, 1);
  renderChips();
  syncPickerCheckboxes();
}

function removeIngredientValue(value) {
  removeIngredientAt(ingredients.indexOf(value));
}

function addIngredientFromInput() {
  const value = ingredientInput.value;
  ingredientInput.value = '';
  ingredientInput.focus();
  addIngredient(value);
}

// ==========================================================================
// FILTER BAHAN (picker: dropdown pencarian + checkbox)
// ==========================================================================

let ingredientTokens = []; // { token, count }[], diisi setelah loadRecipes()

function renderPickerList(query) {
  const q = (query || '').trim().toLowerCase();
  const source = q
    ? ingredientTokens.filter((t) => t.token.includes(q))
    : ingredientTokens;

  const shown = source.slice(0, PICKER_MAX_SHOWN);
  pickerList.innerHTML = '';

  if (shown.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'picker-empty';
    empty.textContent = 'Bahan tidak ditemukan.';
    pickerList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const { token } of shown) {
    const optionLabel = document.createElement('label');
    optionLabel.className = 'picker-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.token = token;
    checkbox.checked = ingredients.includes(token);

    const text = document.createElement('span');
    text.textContent = token; // textContent -> aman dari data database

    optionLabel.append(checkbox, text);
    fragment.appendChild(optionLabel);
  }
  pickerList.appendChild(fragment);

  if (source.length > PICKER_MAX_SHOWN) {
    const note = document.createElement('p');
    note.className = 'picker-note';
    note.textContent = `Menampilkan ${PICKER_MAX_SHOWN} dari ${source.length} bahan. Ketik lebih spesifik untuk mempersempit.`;
    pickerList.appendChild(note);
  }
}

function syncPickerCheckboxes() {
  if (pickerPanel.hidden) return;
  pickerList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = ingredients.includes(cb.dataset.token);
  });
}

function openPicker() {
  pickerPanel.hidden = false;
  pickerToggleBtn.setAttribute('aria-expanded', 'true');
  renderPickerList(pickerSearch.value);
  pickerSearch.focus();
}
function closePicker() {
  pickerPanel.hidden = true;
  pickerToggleBtn.setAttribute('aria-expanded', 'false');
}
function togglePicker() {
  if (pickerPanel.hidden) openPicker();
  else closePicker();
}

// ==========================================================================
// GENERATOR + PAGINATION
// ==========================================================================

function setGeneratorMessage(text, isWarning = false) {
  generatorMessage.textContent = text;
  generatorMessage.classList.toggle('is-warning', isWarning);
}
function clearGeneratorMessage() {
  setGeneratorMessage('');
}

function runGenerate() {
  if (ingredients.length === 0) {
    setGeneratorMessage('Silakan masukkan minimal satu bahan.', true);
    resultsSection.hidden = true;
    return;
  }

  clearGeneratorMessage();

  // Tanpa batas artifisial di sini -- semua resep yang cocok diambil,
  // baru dipotong per halaman lewat pagination supaya tidak berat dirender sekaligus.
  currentResults = generateRecipes(ingredients, { limit: null });
  currentPage = 1; // filter/generate baru selalu kembali ke halaman pertama

  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  renderResultsPage();
}

function totalPages() {
  return Math.max(1, Math.ceil(currentResults.length / PAGE_SIZE));
}

function renderResultsPage() {
  if (currentResults.length === 0) {
    resultsCount.textContent = '';
    pagination.hidden = true;
    renderRecipeGrid(resultsGrid, [], 'Tidak ditemukan resep yang cocok dengan bahan tersebut.');
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, currentResults.length);
  const pageItems = currentResults.slice(start, end);

  resultsCount.textContent = `Menampilkan ${start + 1}\u2013${end} dari ${currentResults.length} resep`;
  renderRecipeGrid(resultsGrid, pageItems, 'Tidak ditemukan resep yang cocok dengan bahan tersebut.');

  const pages = totalPages();
  pagination.hidden = pages <= 1;
  paginationInfo.textContent = `Halaman ${currentPage} dari ${pages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= pages;
}

function goToPage(page) {
  const pages = totalPages();
  currentPage = Math.min(Math.max(1, page), pages);
  renderResultsPage();
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ==========================================================================
// RENDERING KARTU RESEP (dipakai untuk hasil generator & daftar favorit)
// ==========================================================================

function renderFavoriteButton(recipe) {
  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'recipe-card-fav';
  favBtn.dataset.id = recipe.id;
  const fav = isFavorite(recipe.id);
  favBtn.textContent = fav ? '\u2665' : '\u2661'; // ♥ / ♡
  favBtn.classList.toggle('is-fav', fav);
  favBtn.setAttribute('aria-label', fav ? 'Hapus dari favorit' : 'Tambahkan ke favorit');
  return favBtn;
}

function renderRecipeCard(recipe) {
  const card = document.createElement('div');
  card.className = 'recipe-card';
  card.dataset.id = recipe.id;

  const top = document.createElement('div');
  top.className = 'recipe-card-top';

  const catLabel = document.createElement('span');
  catLabel.className = 'recipe-card-category';
  catLabel.textContent = toTitleCase(recipe.category);

  top.append(catLabel, renderFavoriteButton(recipe));

  const title = document.createElement('h3');
  title.className = 'recipe-card-title';
  title.textContent = recipe.title;

  card.append(top, title);

  if (typeof recipe.matchPercentage === 'number') {
    const match = document.createElement('div');
    match.className = 'recipe-card-match' + (recipe.matchPercentage < 100 ? ' partial' : '');
    match.textContent = `${recipe.matchPercentage}% Cocok`;
    card.appendChild(match);

    const meta = document.createElement('div');
    meta.className = 'recipe-card-meta';
    meta.textContent = `${recipe.matchedCount} dari ${recipe.totalCount} bahan cocok`;
    card.appendChild(meta);
  }

  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'recipe-card-btn';
  viewBtn.dataset.id = recipe.id;
  viewBtn.textContent = 'Lihat Resep';
  card.appendChild(viewBtn);

  return card;
}

function renderRecipeGrid(container, list, emptyMessage) {
  container.innerHTML = '';

  if (!list || list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const p = document.createElement('p');
    p.textContent = emptyMessage;
    empty.appendChild(p);
    container.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const recipe of list) {
    fragment.appendChild(renderRecipeCard(recipe));
  }
  container.appendChild(fragment);
}

// ==========================================================================
// FAVORIT
// ==========================================================================

function updateFavoritesBadge() {
  favoritesCountBadge.textContent = getFavoritesCount();
}

function handleToggleFavorite(id) {
  const nowFav = toggleFavorite(id);
  updateFavoritesBadge();
  showToast(nowFav ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit');

  // Sinkronkan semua tombol hati yang sedang tampil untuk resep ini
  // (bisa muncul di grid hasil, grid favorit, dan modal detail sekaligus).
  document.querySelectorAll(`.recipe-card-fav[data-id="${id}"]`).forEach((btn) => {
    btn.textContent = nowFav ? '\u2665' : '\u2661';
    btn.classList.toggle('is-fav', nowFav);
    btn.setAttribute('aria-label', nowFav ? 'Hapus dari favorit' : 'Tambahkan ke favorit');
  });
  const detailFavBtn = document.getElementById('detailFavBtn');
  if (detailFavBtn && Number(detailFavBtn.dataset.id) === Number(id)) {
    syncDetailFavButton(detailFavBtn, id);
  }

  // Kalau modal favorit sedang terbuka dan resep di-unfavorite dari sana, re-render listnya.
  if (!favoritesModal.hidden) renderFavoritesModal();
}

function renderFavoritesModal() {
  const ids = getFavorites();
  const recipes = ids.map((id) => getRecipeById(id)).filter(Boolean);
  renderRecipeGrid(favoritesGrid, recipes, 'Belum ada resep favorit.');
}

function openFavoritesModal() {
  renderFavoritesModal();
  favoritesModal.hidden = false;
}
function closeFavorites() {
  favoritesModal.hidden = true;
}

// ==========================================================================
// DETAIL MODAL
// ==========================================================================

function syncDetailFavButton(favBtn, id) {
  const fav = isFavorite(id);
  favBtn.textContent = fav ? '\u2665 Hapus dari Favorit' : '\u2661 Tambah ke Favorit';
  favBtn.classList.toggle('is-fav', fav);
}

function buildDetailContent(recipe) {
  const wrap = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'detail-header';

  const topRow = document.createElement('div');
  topRow.className = 'detail-top-row';

  const catBadge = document.createElement('span');
  catBadge.className = 'detail-category';
  catBadge.textContent = toTitleCase(recipe.category);

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.id = 'detailFavBtn';
  favBtn.className = 'recipe-card-fav recipe-card-fav-labeled';
  favBtn.dataset.id = recipe.id;
  syncDetailFavButton(favBtn, recipe.id);
  favBtn.addEventListener('click', () => handleToggleFavorite(recipe.id));

  topRow.append(catBadge, favBtn);

  const title = document.createElement('h3');
  title.className = 'detail-title';
  title.textContent = recipe.title;

  const stats = document.createElement('div');
  stats.className = 'detail-stats';
  stats.innerHTML =
    (recipe.totalIngredients != null ? `<span>🧂 ${recipe.totalIngredients} bahan</span>` : '') +
    (recipe.totalSteps != null ? `<span>📋 ${recipe.totalSteps} langkah</span>` : '') +
    `<span>🏷️ ${toTitleCase(recipe.category)}</span>`;

  header.append(topRow, title, stats);

  // Bahan
  const ingredientsParsed = parseIngredients(recipe.ingredientsRaw);
  const ingSection = document.createElement('div');
  ingSection.className = 'detail-section';
  const ingHeading = document.createElement('h3');
  ingHeading.textContent = 'Bahan';
  const ingList = document.createElement('ul');
  ingList.className = 'ingredient-list';
  if (ingredientsParsed.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Data bahan tidak tersedia untuk resep ini.';
    ingList.appendChild(li);
  } else {
    for (const item of ingredientsParsed) {
      const li = document.createElement('li');
      li.textContent = item;
      ingList.appendChild(li);
    }
  }
  ingSection.append(ingHeading, ingList);

  // Langkah
  const steps = parseSteps(recipe.stepsRaw);
  const stepSection = document.createElement('div');
  stepSection.className = 'detail-section';
  const stepHeading = document.createElement('h3');
  stepHeading.textContent = 'Cara Memasak';
  const stepList = document.createElement('ol');
  stepList.className = 'step-list';
  if (steps.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Data langkah tidak tersedia untuk resep ini.';
    stepList.appendChild(li);
  } else {
    for (const step of steps) {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = step;
      li.appendChild(span);
      stepList.appendChild(li);
    }
  }
  stepSection.append(stepHeading, stepList);

  // Aksi: sumber resep
  const actions = document.createElement('div');
  actions.className = 'detail-actions';
  if (isSafeUrl(recipe.url)) {
    const sourceLink = document.createElement('a');
    sourceLink.href = recipe.url;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    sourceLink.className = 'btn btn-primary';
    sourceLink.textContent = 'Lihat Sumber';
    actions.appendChild(sourceLink);
  }

  wrap.append(header, ingSection, stepSection, actions);
  return wrap;
}

function openDetailModal(id) {
  const recipe = getRecipeById(id);
  if (!recipe) {
    showToast('Resep tidak ditemukan.');
    return;
  }
  detailModalTitle.textContent = recipe.title;
  detailModalBody.innerHTML = '';
  detailModalBody.appendChild(buildDetailContent(recipe));
  detailModal.hidden = false;
}

function closeDetail() {
  detailModal.hidden = true;
}

// ==========================================================================
// DARK MODE
// ==========================================================================

const THEME_KEY = 'resepin_theme';

function applyTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  themeToggle.querySelector('.theme-toggle-icon').textContent = isDark ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap');
}

function initTheme() {
  let isDark = false;
  try {
    isDark = localStorage.getItem(THEME_KEY) === 'dark';
  } catch (err) {
    // localStorage diblokir browser -> selalu mulai dari mode terang, tidak apa-apa
  }
  applyTheme(isDark);
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'dark';
  applyTheme(isDark);
  try {
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  } catch (err) {
    // gagal simpan preferensi -> tidak masalah, cuma tidak diingat sesi berikutnya
  }
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================

function bindEvents() {
  themeToggle.addEventListener('click', toggleTheme);
  favoritesNavBtn.addEventListener('click', openFavoritesModal);
  closeFavoritesModal.addEventListener('click', closeFavorites);
  favoritesModal.addEventListener('click', (e) => {
    if (e.target === favoritesModal) closeFavorites();
  });

  addIngredientBtn.addEventListener('click', addIngredientFromInput);
  ingredientInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addIngredientFromInput();
    }
  });

  ingredientChips.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.chip-remove');
    if (removeBtn) removeIngredientAt(Number(removeBtn.dataset.index));
  });

  // Filter bahan (picker)
  pickerToggleBtn.addEventListener('click', togglePicker);
  pickerSearch.addEventListener('input', () => renderPickerList(pickerSearch.value));
  pickerList.addEventListener('change', (e) => {
    const checkbox = e.target.closest('input[type="checkbox"]');
    if (!checkbox) return;
    if (checkbox.checked) addIngredient(checkbox.dataset.token);
    else removeIngredientValue(checkbox.dataset.token);
  });
  document.addEventListener('click', (e) => {
    if (!pickerPanel.hidden && !e.target.closest('.ingredient-picker')) closePicker();
  });

  generateBtn.addEventListener('click', runGenerate);

  prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
  nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));

  // Event delegation: tombol favorit & "Lihat Resep" di grid hasil MAUPUN grid favorit
  document.addEventListener('click', (e) => {
    const favBtn = e.target.closest('.recipe-card-fav:not(.recipe-card-fav-labeled)');
    if (favBtn && favBtn.dataset.id) {
      handleToggleFavorite(favBtn.dataset.id);
      return;
    }
    const viewBtn = e.target.closest('.recipe-card-btn');
    if (viewBtn) openDetailModal(viewBtn.dataset.id);
  });

  closeDetailModal.addEventListener('click', closeDetail);
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!detailModal.hidden) closeDetail();
    if (!favoritesModal.hidden) closeFavorites();
    if (!pickerPanel.hidden) closePicker();
  });
}

// ==========================================================================
// INIT
// ==========================================================================

async function init() {
  el('footerYear').textContent = new Date().getFullYear();
  initTheme();
  updateFavoritesBadge();
  bindEvents();
  renderChips();
  generateBtn.disabled = true;
  setGeneratorMessage('Memuat database resep...');

  try {
    await loadRecipes();
    ingredientTokens = getIngredientTokens();
    generateBtn.disabled = false;
    clearGeneratorMessage();
  } catch (err) {
    generateBtn.disabled = true;
    setGeneratorMessage(err.message || 'Gagal memuat database resep.', true);
  }
}

init();
