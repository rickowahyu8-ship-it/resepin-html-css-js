
import { loadRecipes, getRecipeById, parseIngredients, parseSteps } from './recipes.js';
import { normalizeIngredient, generateRecipes } from './generator.js';
import { isSafeUrl, showToast, toTitleCase } from './utils.js';

// ---- State bahan yang sudah ditambahkan pengguna ----
let ingredients = [];

// ---- Referensi elemen DOM ----
const el = (id) => document.getElementById(id);

const ingredientInput = el('ingredientInput');
const addIngredientBtn = el('addIngredientBtn');
const ingredientChips = el('ingredientChips');
const generateBtn = el('generateBtn');
const generatorMessage = el('generatorMessage');

const resultsSection = el('resultsSection');
const resultsCount = el('resultsCount');
const resultsGrid = el('resultsGrid');

const detailModal = el('detailModal');
const closeDetailModal = el('closeDetailModal');
const detailModalTitle = el('detailModalTitle');
const detailModalBody = el('detailModalBody');

// ==========================================================================
// CHIP BAHAN
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

function addIngredientFromInput() {
  const value = normalizeIngredient(ingredientInput.value);
  ingredientInput.value = '';
  ingredientInput.focus();

  if (!value) return;

  if (ingredients.includes(value)) {
    showToast(`"${value}" sudah ada di daftar bahan.`);
    return;
  }

  ingredients.push(value);
  renderChips();
  clearGeneratorMessage();
}

function removeIngredientAt(index) {
  ingredients.splice(index, 1);
  renderChips();
}

// ==========================================================================
// GENERATOR
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

  const results = generateRecipes(ingredients, { limit: 30 });

  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (results.length === 0) {
    resultsCount.textContent = '';
    renderResultsGrid([]);
    return;
  }

  resultsCount.textContent = `${results.length} resep ditemukan, diurutkan dari kecocokan tertinggi`;
  renderResultsGrid(results);
}

// ==========================================================================
// RENDERING KARTU HASIL
// ==========================================================================

function renderRecipeCard(recipe) {
  const card = document.createElement('div');
  card.className = 'recipe-card';
  card.dataset.id = recipe.id;

  const catLabel = document.createElement('span');
  catLabel.className = 'recipe-card-category';
  catLabel.textContent = toTitleCase(recipe.category);

  const title = document.createElement('h3');
  title.className = 'recipe-card-title';
  title.textContent = recipe.title;

  const match = document.createElement('div');
  match.className = 'recipe-card-match' + (recipe.matchPercentage < 100 ? ' partial' : '');
  match.textContent = `${recipe.matchPercentage}% Cocok`;

  const meta = document.createElement('div');
  meta.className = 'recipe-card-meta';
  meta.textContent = `${recipe.matchedCount} dari ${recipe.totalCount} bahan cocok`;

  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'recipe-card-btn';
  viewBtn.dataset.id = recipe.id;
  viewBtn.textContent = 'Lihat Resep';

  card.append(catLabel, title, match, meta, viewBtn);
  return card;
}

function renderResultsGrid(list) {
  resultsGrid.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<p>Tidak ditemukan resep yang cocok dengan bahan tersebut.</p>';
    resultsGrid.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const recipe of list) {
    fragment.appendChild(renderRecipeCard(recipe));
  }
  resultsGrid.appendChild(fragment);
}

// ==========================================================================
// DETAIL MODAL
// ==========================================================================

function buildDetailContent(recipe) {
  const wrap = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'detail-header';

  const catBadge = document.createElement('span');
  catBadge.className = 'detail-category';
  catBadge.textContent = toTitleCase(recipe.category);

  const title = document.createElement('h3');
  title.className = 'detail-title';
  title.textContent = recipe.title;

  const stats = document.createElement('div');
  stats.className = 'detail-stats';
  stats.innerHTML =
    (recipe.totalIngredients != null ? `<span>🧂 ${recipe.totalIngredients} bahan</span>` : '') +
    (recipe.totalSteps != null ? `<span>📋 ${recipe.totalSteps} langkah</span>` : '') +
    `<span>🏷️ ${toTitleCase(recipe.category)}</span>`;

  header.append(catBadge, title, stats);

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
// EVENT LISTENERS
// ==========================================================================

function bindEvents() {
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

  generateBtn.addEventListener('click', runGenerate);

  resultsGrid.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('.recipe-card-btn');
    if (viewBtn) openDetailModal(viewBtn.dataset.id);
  });

  closeDetailModal.addEventListener('click', closeDetail);
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detailModal.hidden) closeDetail();
  });
}

// ==========================================================================
// INIT
// ==========================================================================

async function init() {
  el('footerYear').textContent = new Date().getFullYear();
  bindEvents();
  renderChips();
  generateBtn.disabled = true;
  setGeneratorMessage('Memuat database resep...');

  try {
    await loadRecipes();
    generateBtn.disabled = false;
    clearGeneratorMessage();
  } catch (err) {
    generateBtn.disabled = true;
    setGeneratorMessage(err.message || 'Gagal memuat database resep.', true);
  }
}

init();
