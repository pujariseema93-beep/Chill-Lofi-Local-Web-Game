const SAVE_KEY = "lofi-garden-save-v1";
const JOURNAL_KEY = "lofi-garden-journal-v1";

const MAX_POTS = 5;
const SEED_COST = 3;
const WATER_DRAIN_PER_SECOND = 100 / (8 * 60 * 60);
const GROWTH_PER_SECOND = 100 / (3 * 60 * 60);
const OFFLINE_CAP_SECONDS = 48 * 60 * 60;

const SPECIES = {
  monstera: { label: "monstera", icon: "🌿" },
  cactus: { label: "little cactus", icon: "🌵" },
  lavender: { label: "lavender", icon: "🪻" },
  pearls: { label: "string of pearls", icon: "🪴" },
  bonsai: { label: "little bonsai", icon: "🌳" },
  lily: { label: "peace lily", icon: "🌱" },
  fern: { label: "fern", icon: "🌿" },
  marigold: { label: "marigold", icon: "🌼" }
};

const speciesKeys = Object.keys(SPECIES);
const $ = (selector) => document.querySelector(selector);

const state = {
  petals: 3,
  plants: [{ species: "fern", growth: 6, water: 85 }],
  musicOn: false,
  rainOn: false,
  lastSeen: Date.now(),
  journal: []
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stageFor(growth) {
  if (growth >= 100) return 4;
  if (growth >= 70) return 3;
  if (growth >= 40) return 2;
  if (growth >= 18) return 1;
  return 0;
}

function toast(message) {
  const element = $("#toast");
  if (element) element.textContent = message;
}

function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Could not save garden", error);
  }
}

function loadState() {
  const saved = readJSON(SAVE_KEY, null);
  if (saved) {
    state.petals = Number(saved.petals ?? 0);
    state.plants = Array.isArray(saved.plants) && saved.plants.length ? saved.plants : state.plants;
    state.musicOn = Boolean(saved.musicOn);
    state.rainOn = Boolean(saved.rainOn);
    state.lastSeen = Number(saved.lastSeen ?? Date.now());
  }

  const journal = readJSON(JOURNAL_KEY, []);
  if (Array.isArray(journal)) state.journal = journal;

  const elapsed = clamp((Date.now() - state.lastSeen) / 1000, 0, OFFLINE_CAP_SECONDS);
  if (elapsed >= 5) {
    advancePlants(elapsed);
    toast("welcome back. your garden kept growing while you were away.");
  }
}

function saveState() {
  state.lastSeen = Date.now();
  writeJSON(SAVE_KEY, {
    petals: state.petals,
    plants: state.plants,
    musicOn: state.musicOn,
    rainOn: state.rainOn,
    lastSeen: state.lastSeen
  });
  writeJSON(JOURNAL_KEY, state.journal.slice(-200));
}

function advancePlants(seconds) {
  for (const plant of state.plants) {
    const waterBeforeGrowth = plant.water;
    const usableSeconds = Math.min(seconds, waterBeforeGrowth / WATER_DRAIN_PER_SECOND || 0);
    plant.water = clamp(waterBeforeGrowth - WATER_DRAIN_PER_SECOND * seconds, 0, 100);
    plant.growth = clamp(plant.growth + usableSeconds * GROWTH_PER_SECOND, 0, 100);
  }
}

function plantIcon(plant) {
  return stageFor(plant.growth) === 0 ? "🌱" : SPECIES[plant.species]?.icon || "🌱";
}

function renderPlants() {
  const container = $("#pot-container");
  if (!container) return;

  container.replaceChildren(...state.plants.map((plant, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pot-slot";
    button.title = plant.growth >= 100 ? "Gather petals" : "Water plant";
    button.addEventListener("click", () => interactWithPlant(index));

    const meter = document.createElement("span");
    meter.className = "water-meter";
    const fill = document.createElement("span");
    fill.style.width = `${clamp(plant.water, 0, 100)}%`;
    meter.appendChild(fill);

    const art = document.createElement("span");
    art.className = "plant-art";
    art.textContent = plantIcon(plant);

    const pot = document.createElement("span");
    pot.className = "pot";

    const name = document.createElement("span");
    name.className = "plant-name";
    name.textContent = `${SPECIES[plant.species]?.label || "plant"} · ${Math.round(plant.growth)}%`;

    button.append(meter, art, pot, name);
    return button;
  }));
}

function render() {
  $("#petal-count").textContent = String(state.petals);
  $("#rain-button").textContent = `rain: ${state.rainOn ? "on" : "off"}`;
  $("#music-button").textContent = `music: ${state.musicOn ? "on" : "off"}`;
  $("#sky").style.background = state.rainOn ? "linear-gradient(#343b67, #727895 65%, #8b8caa)" : "linear-gradient(#443e78, #c88c8d 65%, #efa87d)";
  renderPlants();
}

function interactWithPlant(index) {
  const plant = state.plants[index];
  if (!plant) return;

  if (plant.growth >= 100) {
    state.petals += 2;
    plant.growth = 45;
    plant.water = Math.max(plant.water, 40);
    toast(`gathered 2 petals from your ${SPECIES[plant.species].label}.`);
    playSfx("pop");
  } else if (plant.water > 82) {
    toast("this one is already well watered.");
  } else {
    plant.water = 100;
    toast(`watered the ${SPECIES[plant.species].label}.`);
    playSfx("plip");
  }

  saveState();
  render();
}

function plantSeed() {
  if (state.plants.length >= MAX_POTS) return toast("the sill is full — gather a blooming plant first.");
  if (state.petals < SEED_COST) return toast("not enough petals — you need 3.");

  state.petals -= SEED_COST;
  const species = speciesKeys[Math.floor(Math.random() * speciesKeys.length)];
  state.plants.push({ species, growth: 0, water: 72 });
  toast(`planted a ${SPECIES[species].label} seedling.`);
  playSfx("pop");
  saveState();
  render();
}

function renderJournal() {
  const entries = $("#journal-entries");
  if (!entries) return;

  entries.replaceChildren(...state.journal.slice(-7).reverse().map((entry) => {
    const item = document.createElement("article");
    item.className = "entry";
    const time = document.createElement("time");
    time.textContent = new Date(entry.t).toLocaleString();
    const text = document.createElement("div");
    text.textContent = entry.text;
    item.append(time, text);
    return item;
  }));
}

function addJournalEntry() {
  const input = $("#journal-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  state.journal.push({ t: Date.now(), text });
  input.value = "";
  saveState();
  renderJournal();
  toast("noted down.");
}

function setupStars() {
  const stars = $("#stars");
  if (!stars) return;
  for (let index = 0; index < 55; index += 1) {
    const star = document.createElement("i");
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 70}%`;
    star.style.opacity = `${0.25 + Math.random() * 0.75}`;
    stars.appendChild(star);
  }
}

function setupRain() {
  const rainLayer = document.createElement("div");
  rainLayer.className = "rain-layer";
  const sky = $("#sky");
  if (!sky) return;

  for (let index = 0; index < 70; index += 1) {
    const drop = document.createElement("i");
    drop.style.left = `${Math.random() * 100}%`;
    drop.style.animationDelay = `${Math.random() * 1.5}s`;
    drop.style.animationDuration = `${0.45 + Math.random() * 0.55}s`;
    rainLayer.appendChild(drop);
  }
  sky.appendChild(rainLayer);
  updateRain();
}

function updateRain() {
  const rainLayer = $(".rain-layer");
  if (rainLayer) rainLayer.hidden = !state.rainOn;
}

function getAudioContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!window.__lofiAudio) window.__lofiAudio = new AudioCtor();
  return window.__lofiAudio;
}

function playTone(frequency, duration, type = "sine", volume = 0.025) {
  const context = getAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playSfx(kind) {
  if (kind === "plip") {
    playTone(880, 0.12, "triangle", 0.025);
    playTone(440, 0.16, "sine", 0.012);
  } else if (kind === "pop") {
    playTone(520, 0.14, "sine", 0.025);
    playTone(780, 0.18, "triangle", 0.018);
  }
}

function toggleMusic() {
  const context = getAudioContext();
  if (!context) return;

  if (!window.__lofiNodes) {
    window.__lofiNodes = [174.61, 220, 261.63, 329.63].map((frequency) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.0001;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      return gain;
    });
  }

  window.__lofiNodes.forEach((gain, index) => {
    gain.gain.setTargetAtTime(state.musicOn ? 0.012 + index * 0.002 : 0.0001, context.currentTime, 0.5);
  });
}

function setupEvents() {
  $("#seed-button")?.addEventListener("click", plantSeed);

  $("#rain-button")?.addEventListener("click", () => {
    state.rainOn = !state.rainOn;
    updateRain();
    toast(state.rainOn ? "rain on. stay in." : "rain off.");
    saveState();
    render();
  });

  $("#music-button")?.addEventListener("click", () => {
    state.musicOn = !state.musicOn;
    toggleMusic();
    toast(state.musicOn ? "lofi on." : "lofi off.");
    saveState();
    render();
  });

  const dialog = $("#journal-dialog");
  $("#journal-button")?.addEventListener("click", () => {
    renderJournal();
    dialog?.showModal();
  });
  $("#save-entry")?.addEventListener("click", addJournalEntry);
}

function init() {
  setupStars();
  setupRain();
  loadState();
  setupEvents();
  updateRain();
  render();
  saveState();

  let lastFrame = performance.now();
  function loop(now) {
    const deltaSeconds = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    advancePlants(deltaSeconds);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  setInterval(saveState, 10000);
  window.addEventListener("beforeunload", saveState);
}

init();
