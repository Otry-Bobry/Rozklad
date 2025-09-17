// -----------------
// ВАЖЛИВО: заміни sheetUrl на свій CSV-посилання з Google Sheets
// Отримати: Файл → Опублікувати в інтернеті → формат CSV → скопіювати URL
// Приклад: "https://docs.google.com/spreadsheets/d/ВАШ_ID/export?format=csv"
// -----------------
const sheetUrl = "https://docs.google.com/spreadsheets/d/1PdUmF2UjeKjiYnzz9Tc0Y6ax_AqSR0qhrZ72mlKq_qs/export?format=csv"; // <-- вставити сюди

let scheduleData = {}; // { group1: {Понеділок: [{time,subject}, ...], ...}, group2: {...} }
let groups = [];
let currentGroup = null;

const daysOrder = ["Понеділок","Вівторок","Середа","Четвер","П’ятниця","Субота","Неділя"];
const daysForGetDay = ["Неділя","Понеділок","Вівторок","Середа","Четвер","П’ятниця","Субота"];

const loadingEl = document.getElementById('loading');
const groupSelect = document.getElementById('group-select');

function showLoading(show){
  if(!loadingEl) return;
  loadingEl.hidden = !show;
}

/** Простий, але надійний парсер CSV (працює з лапками і комами в полях) */
function parseCSV(text){
  const rows = [];
  let cur = "";
  let row = [];
  let inQuotes = false;
  for(let i=0;i<text.length;i++){
    const ch = text[i];
    const next = text[i+1];

    if(inQuotes){
      if(ch === '"' && next === '"'){ // escaped quote
        cur += '"';
        i++;
      } else if(ch === '"'){
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if(ch === '"'){
        inQuotes = true;
      } else if(ch === ',' ){
        row.push(cur);
        cur = "";
      } else if(ch === '\r'){
        // ignore, wait for \n or skip
      } else if(ch === '\n'){
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  // push last
  if(cur !== "" || row.length > 0){
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/** Завантажуємо CSV з Google Sheets і структуруємо дані */
async function loadSchedule(){
  try{
    showLoading(true);
    const res = await fetch(sheetUrl);
    if(!res.ok){
      throw new Error(`Fetch error: ${res.status}`);
    }
    const text = await res.text();
    // парсимо
    const rawRows = parseCSV(text).map(r => r.map(c => (c||"").trim()));
    if(rawRows.length === 0){
      throw new Error("Порожній CSV");
    }

    // headers (звичайно: group,day,time,subject) — приведемо до нижнього регістру
    const headerRow = rawRows[0].map(h => h.replace(/\uFEFF/g,"").trim().toLowerCase()); // видалити BOM
    const idx = {};
    headerRow.forEach((h,i) => idx[h] = i);

    // перевіримо необхідні поля
    const need = ["group","day","time","subject"];
    for(const f of need){
      if(!(f in idx)){
        throw new Error(`В CSV немає колонки "${f}". Перевір заголовки (повинні бути: group, day, time, subject).`);
      }
    }

    // читаємо рядки
    scheduleData = {};
    groups = [];
    for(let r=1;r<rawRows.length;r++){
      const row = rawRows[r];
      if(row.length === 0) continue;
      const group = (row[idx["group"]]||"").trim();
      const day = (row[idx["day"]]||"").trim();
      const time = (row[idx["time"]]||"").trim();
      const subject = (row[idx["subject"]]||"").trim();
      if(!group || !day) continue;

      if(!scheduleData[group]) scheduleData[group] = {};
      if(!scheduleData[group][day]) scheduleData[group][day] = [];
      scheduleData[group][day].push({time, subject});

      if(!groups.includes(group)) groups.push(group);
    }

    // сортуємо групи алфавітно
    groups.sort();

    populateGroupSelect();
    // встановити currentGroup: або з localStorage або перша група
    const stored = localStorage.getItem('selectedGroup');
    currentGroup = stored && groups.includes(stored) ? stored : (groups[0] || null);

    if(currentGroup){
      groupSelect.value = currentGroup;
      renderGroup(currentGroup);
    } else {
      document.getElementById('today').innerHTML = '<div class="schedule__empty">Розклад не знайдено.</div>';
      document.getElementById('week').innerHTML = '';
    }

  } catch(err){
    console.error(err);
    document.getElementById('today').innerHTML = `<div class="schedule__empty">Помилка завантаження: ${err.message}</div>`;
    document.getElementById('week').innerHTML = '';
  } finally{
    showLoading(false);
  }
}

function populateGroupSelect(){
  groupSelect.innerHTML = "";
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    groupSelect.appendChild(opt);
  });
}

/** Зміна групи зі списку */
function changeGroup(group){
  if(!group) return;
  currentGroup = group;
  localStorage.setItem('selectedGroup', group);
  renderGroup(group);
}

/** Рендерити вибрану групу */
function renderGroup(group){
  const week = scheduleData[group] || {};
  // today name
  const todayName = daysForGetDay[new Date().getDay()]; // 0..6 -> Неділя..Субота
  renderToday(week[todayName] || []);
  renderWeek(week, todayName);
}

/** Сьогодні */
function renderToday(todayArr){
  const container = document.getElementById('today');
  if(!todayArr || todayArr.length === 0){
    container.innerHTML = '<div class="schedule__empty">Сьогодні пар немає.</div>';
    return;
  }
  // сортувати за часом (простіше: лексичний)
  const arr = [...todayArr].sort((a,b)=> a.time.localeCompare(b.time));

  let html = `<table class="schedule__table"><thead><tr><th>Час</th><th>Предмет</th></tr></thead><tbody>`;
  arr.forEach(item => {
    html += `<tr class="schedule__today-row"><td>${escapeHtml(item.time)}</td><td>${escapeHtml(item.subject)}</td></tr>`;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
}

/** Тиждень — блоки за днями */
function renderWeek(weekObj, todayName){
  const container = document.getElementById('week');
  container.innerHTML = "";

  // Пройти дні в порядку daysOrder
  let any = false;
  daysOrder.forEach(day => {
    const items = weekObj[day];
    if(!items || items.length === 0) return;

    any = true;
    const block = document.createElement('div');
    block.className = 'week-day-block';
    if(day === todayName) block.classList.add('today');

    const h = document.createElement('h3');
    h.textContent = day.toUpperCase();
    block.appendChild(h);

    const table = document.createElement('table');
    table.className = 'schedule__table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><th>Час</th><th>Предмет</th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // сортуємо по часу
    const arr = [...items].sort((a,b)=> a.time.localeCompare(b.time));
    arr.forEach(it => {
      const tr = document.createElement('tr');
      if(day === todayName) tr.classList.add('schedule__today-row');
      const tdTime = document.createElement('td');
      tdTime.textContent = it.time;
      const tdSub = document.createElement('td');
      tdSub.textContent = it.subject;
      tr.appendChild(tdTime);
      tr.appendChild(tdSub);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    block.appendChild(table);
    container.appendChild(block);
  });

  if(!any){
    container.innerHTML = '<div class="schedule__empty">Для цієї групи розклад не знайдено.</div>';
  }
}

/** Показати Today або Week */
function showSchedule(id, event){
  document.querySelectorAll('.schedule').forEach(el => el.classList.remove('schedule--active'));
  document.querySelectorAll('.controls__button').forEach(el => el.classList.remove('controls__button--active'));
  document.getElementById(id).classList.add('schedule--active');
  if(event && event.target) event.target.classList.add('controls__button--active');
}

/** Оновити (перезавантажити CSV) */
function refreshSchedule(){
  loadSchedule();
}

/** Захист від XSS (набагато простіше, бо ми лише відображаємо текст) */
function escapeHtml(str){
  if(!str) return "";
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

// старт
loadSchedule();

// Темна тема
const themeBtn = document.getElementById("themeToggle");
themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  // міняємо іконку
  themeBtn.textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
});
