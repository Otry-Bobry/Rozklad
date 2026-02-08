// -----------------
// ВАЖЛИВО: переконайся, що sheetUrl вказано вірно і Google Sheet опубліковано як CSV
// -----------------
const sheetUrl = "https://docs.google.com/spreadsheets/d/1PdUmF2UjeKjiYnzz9Tc0Y6ax_AqSR0qhrZ72mlKq_qs/export?format=csv";

let scheduleData = {}; // { group: {Понеділок: [{time,subject,room,link}, ...], ...} }
let groups = [];
let currentGroup = null;
let selectedSubgroups = {}; 
// { "Англійська": "1", "Сольфеджіо": "А" }


const daysOrder = ["Понеділок","Вівторок","Середа","Четвер","П’ятниця","Субота","Неділя"];
const daysForGetDay = ["Неділя","Понеділок","Вівторок","Середа","Четвер","П’ятниця","Субота"];

const loadingEl = document.getElementById('loading');
const groupSelect = document.getElementById('group-select');

function showLoading(show){
  if(!loadingEl) return;
  loadingEl.hidden = !show;
}

/** Простий CSV парсер (робочий для більшості CSV, бере до уваги лапки) */
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
        // ignore CR
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
  if(cur !== "" || row.length > 0){
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/** Нормалізація заголовків (видаляє пробіли, пунктуацію, ставить в lower) */
function normalizeHeader(h){
  return String(h || "")
    .replace(/\uFEFF/g,"")        // BOM
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\s\W_]+/g, '');    // лишаємо тільки букви/цифри
}

/** Пошук індексу першого підходящого імені стовпця (альтернативи) */
function findIndexByAliases(headersNorm, aliases){
  for(const alias of aliases){
    const norm = normalizeHeader(alias);
    const idx = headersNorm.indexOf(norm);
    if(idx >= 0) return idx;
  }
  return -1;
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
    const rawRows = parseCSV(text).map(r => r.map(c => (c||"").trim()));
    if(rawRows.length === 0){
      throw new Error("Порожній CSV");
    }

    // заголовки
    const headerRowRaw = rawRows[0];
    const headersNorm = headerRowRaw.map(h => normalizeHeader(h));

    // допустимі назви колонок (пошук враховує англ/укр варіанти)
    const aliases = {
      id: ['id'],
      group: ['group','група','groupname','groupid'],
      day: ['day','день'],
      time: ['time','час','time_','hour'],
      subject: ['subject','предмет','lesson','course','назва'],
      room: ['room','auditorium','аудиторія','ауд','classroom','аудиторія№','аудиторіяномер'],
      subgroup: ['subgroup','підгрупа','group2'],
      link: ['link','url','посилання','лінк','meeting','meetinglink']
    };

    const idx = {};
    for(const key of Object.keys(aliases)){
      idx[key] = findIndexByAliases(headersNorm, aliases[key]);
    }

    // Перевірка обов'язкових полів
    const required = ['group','day','time','subject'];
    for(const r of required){
      if(idx[r] < 0){
        throw new Error(`У CSV не знайдено обов'язковий стовпець для "${r}". Можливі імена: ${aliases[r].join(', ')}`);
      }
    }

    // читаємо рядки
    scheduleData = {};
    groups = [];
    for(let r=1;r<rawRows.length;r++){
      const row = rawRows[r];
      if(!row || row.length === 0) continue;

      const id = idx.id >= 0 ? row[idx.id].trim() : "";
      const group = (idx.group >=0 ? (row[idx.group] || "") : "").trim();
      const day = (idx.day >=0 ? (row[idx.day] || "") : "").trim();
      const time = (idx.time >=0 ? (row[idx.time] || "") : "").trim();
      const subject = (idx.subject >=0 ? (row[idx.subject] || "") : "").trim();
      const subgroup = idx.subgroup >= 0 ? row[idx.subgroup].trim() : "";
      const room = (idx.room >=0 ? (row[idx.room] || "") : "").trim();
      let link = (idx.link >=0 ? (row[idx.link] || "") : "").trim();

      if(!group || !day) continue;

      // якщо посилання є, але без схеми - додаємо https://
      if(link && !/^https?:\/\//i.test(link)){
        link = 'https://' + link;
      }

      if(!scheduleData[group]) scheduleData[group] = {};
      if(!scheduleData[group][day]) scheduleData[group][day] = [];
      scheduleData[group][day].push({
        id: id || crypto.randomUUID(),
        time,
        subject,
        subgroup,
        room,
        link,
        enabled: true,
        type: "sheet"
      });

      if(!groups.includes(group)) groups.push(group);
    }

    groups.sort();

    const savedGroup = localStorage.getItem('selectedGroup');
    const savedSubs = localStorage.getItem('selectedSubgroups');

    if(savedSubs){
      selectedSubgroups = JSON.parse(savedSubs);
    }

    populateOnboardingGroups();

    const app = document.querySelector('.app');

    if(!savedGroup){
      document.getElementById('onboarding').classList.remove('hidden');
      showLoading(false);
      return;
    }

    // ✅ ТІЛЬКИ ТУТ
    app.style.display = 'block';
    document.querySelector('.app').style.display = 'block';


    populateGroupSelect();

    const stored = localStorage.getItem('selectedGroup');
    currentGroup = stored && groups.includes(stored) ? stored : (groups[0] || null);

    if(currentGroup){
      groupSelect.value = currentGroup;
      renderGroup(currentGroup);
      buildBurgerMenu(); 
    } else {
      document.getElementById('today').innerHTML = '<div class="schedule__empty">Розклад не знайдено.</div>';
      document.getElementById('week').innerHTML = '';
    }

  } catch(err){
    console.error(err);
    document.getElementById('today').innerHTML = `<div class="schedule__empty">Помилка завантаження: ${escapeHtml(err.message)}</div>`;
    document.getElementById('week').innerHTML = '';
  } finally{
    showLoading(false);
  }
}

const savedTheme = localStorage.getItem("theme");
if(savedTheme === "dark"){
  document.body.classList.add("dark");
}


function buildOnboardingSubgroups(group){
  if(!scheduleData[group]) return;

  const wrap = document.getElementById('onboarding-subgroups');
  wrap.innerHTML = '';

  const subjects = {};

  for(const day in scheduleData[group]){
    scheduleData[group][day].forEach(item => {
      if (item.enabled === false) return false;

      const subjectKey = normalizeSubject(item.subject);

      if(!subjects[subjectKey]) subjects[subjectKey] = new Set();
      subjects[subjectKey].add(item.subgroup);
    });
  }

  Object.keys(subjects).forEach(subject => {
    const title = document.createElement('div');
    title.className = 'burger-subject';
    title.textContent = subject;

    const list = document.createElement('div');
    list.className = 'burger-groups';

    if(!Array.isArray(selectedSubgroups[subject])){
      selectedSubgroups[subject] = [];
    }

    subjects[subject].forEach(sub => {
      const btn = document.createElement('button');
      btn.textContent = sub === 'OPT'? 'Показувати' : `Група ${sub}`;

      if(selectedSubgroups[subject].includes(sub)){
        btn.classList.add('active');
      }

      btn.onclick = () => {
        const arr = selectedSubgroups[subject];

        if(arr.includes(sub)){
          selectedSubgroups[subject] = arr.filter(s => s !== sub);
          btn.classList.remove('active');
        } else {
          arr.push(sub);
          btn.classList.add('active');
        }

        localStorage.setItem(
          'selectedSubgroups',
          JSON.stringify(selectedSubgroups)
        );
      };

      list.appendChild(btn);
    });

    title.onclick = () => {
      list.style.display = list.style.display === 'block' ? 'none' : 'block';
    };

    wrap.appendChild(title);
    wrap.appendChild(list);
  });
}


function populateOnboardingGroups(){
  const sel = document.getElementById('onboarding-group');
  sel.innerHTML = '';

  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    sel.appendChild(opt);
  });

  sel.onchange = () => {
  selectedSubgroups = {};                 // ❗ скидаємо підгрупи
  localStorage.removeItem('selectedSubgroups');
  buildOnboardingSubgroups(sel.value);
  };

  buildOnboardingSubgroups(sel.value);
}


function finishOnboarding(){
  const group = document.getElementById('onboarding-group').value;

  currentGroup = group;
  localStorage.setItem('selectedGroup', group);
  localStorage.setItem(
    'selectedSubgroups',
    JSON.stringify(selectedSubgroups)
  );

  document.getElementById('onboarding').classList.add('hidden');

  document.querySelector('.app').style.display = 'block';

  renderGroup(group);
  buildBurgerMenu();
}




function toggleBurger(){
  document.getElementById('burgerMenu').classList.toggle('open');
}

function buildBurgerMenu(){
  const menu = document.getElementById('burgerMenu');
  menu.innerHTML = '';

  if(!currentGroup || !scheduleData[currentGroup]) return;

  const subjects = {};

  for(const day in scheduleData[currentGroup]){
    scheduleData[currentGroup][day].forEach(item => {
      if (item.enabled === false) return; // null / undefined — ігноруємо

      const subjectKey = normalizeSubject(item.subject);

      if(!subjects[subjectKey]) subjects[subjectKey] = new Set();
      subjects[subjectKey].add(item.subgroup);
    });
  }

  Object.keys(subjects).forEach(subject => {
    const title = document.createElement('div');
    title.className = 'burger-subject';
    title.textContent = subject;

    const list = document.createElement('div');
    list.className = 'burger-groups';

    if(!Array.isArray(selectedSubgroups[subject])){
      selectedSubgroups[subject] = [];
    }

    subjects[subject].forEach(sub => {
      const btn = document.createElement('button');
      btn.textContent = sub === 'OPT'? 'Показувати' : `Група ${sub}`;


      if(selectedSubgroups[subject].includes(sub)){
        btn.classList.add('active');
      }

      btn.onclick = () => {
        const arr = selectedSubgroups[subject];

        if(arr.includes(sub)){
          selectedSubgroups[subject] = arr.filter(s => s !== sub);
          btn.classList.remove('active');
        } else {
          arr.push(sub);
          btn.classList.add('active');
        }

        localStorage.setItem(
          'selectedSubgroups',
          JSON.stringify(selectedSubgroups)
        );

        renderGroup(currentGroup);
      };

      list.appendChild(btn);
    });

    title.onclick = () => {
      list.style.display = list.style.display === 'block' ? 'none' : 'block';
    };

    menu.appendChild(title);
    menu.appendChild(list);
  });
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
  selectedSubgroups = {};
  localStorage.removeItem('selectedSubgroups');

  localStorage.setItem('selectedGroup', group);

  renderGroup(group);
  buildBurgerMenu();
}


/** Рендерити вибрану групу */
function renderGroup(group){
  const week = scheduleData[group] || {};
  const todayName = daysForGetDay[new Date().getDay()];
  const filtered = {};

  for(const day in week){
    filtered[day] = week[day].filter(item => {
      const subjectKey = normalizeSubject(item.subject);
      const selected = selectedSubgroups[subjectKey];

      if (item.enabled === false) return false;

      // 🔹 вибірний предмет (німецька)
      if (item.subgroup === 'OPT') {
        return Array.isArray(selected) && selected.includes('OPT');
      }

      // 🔹 предмет з підгрупами
      if (item.subgroup) {
        if (!Array.isArray(selected)) return false;
        return selected.includes(item.subgroup);
      }

      // 🔹 звичайний предмет — завжди показуємо
      return true;
    });

  }

  renderToday(filtered[todayName] || []);
  renderWeek(filtered, todayName);
}


/** Створює TD для предмета з аудиторією і посиланням */
function createSubjectCell(subject, room, link){
  const td = document.createElement('td');
  td.className = "lesson-cell";  // додаємо клас

  // const link = document.createElement('td');
  // td.className = "lesson-link-block";

  const leftDiv = document.createElement('div');
  leftDiv.className = "lesson-left";

  const subjSpan = document.createElement('span');
  subjSpan.textContent = subject;
  subjSpan.className = "lesson-name";
  leftDiv.appendChild(subjSpan);

  if(room){
    const roomSpan = document.createElement('span');
    roomSpan.textContent = " · " + room;
    roomSpan.className = "lesson-room";
    leftDiv.appendChild(roomSpan);
  }

  td.appendChild(leftDiv);

  if(link){
    const icon = createLinkIcon(link);
    if(icon) td.appendChild(icon);
  }

  return td;
}


function createLinkIcon(link){
  if(!link) return null;

  const a = document.createElement('a');
  a.className = "link-icon";
  a.href = link;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const img = document.createElement('img');
  img.alt = "link";
  img.className = "lesson-icon";

  if(link.includes("zoom.us")){
    img.src = "https://tidbits.com/uploads/2022/09/Zoom-5_12-icon.png";
  } else if(link.includes("meet.google.com")){
    img.src = "https://img.icons8.com/color/48/google-meet.png";
  } else if(link.includes("teams.microsoft.com")){
    img.src = "https://img.icons8.com/color/48/microsoft-teams.png";
  } else if(link.includes("discord.gg") || link.includes("discord.com")){
    img.src = "https://img.icons8.com/color/48/discord-logo.png";
  } else {
    img.src = "https://img.icons8.com/ios-filled/48/link.png";
  }

  a.appendChild(img);
  return a;
}



/** Сьогодні */
function renderToday(todayArr){
  const container = document.getElementById('today');
  if(!todayArr || todayArr.length === 0){
    container.innerHTML = '<div class="schedule__empty">Сьогодні пар немає.</div>';
    return;
  }
  const arr = [...todayArr].sort((a,b)=> a.time.localeCompare(b.time));

  const table = document.createElement('table');
  table.className = 'schedule__table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th>Час</th><th>Предмет</th></tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  arr.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'schedule__today-row';
    const tdTime = document.createElement('td');
    tdTime.textContent = item.time || '—';
    const tdSub = createSubjectCell(item.subject, item.room, item.link);
    tr.appendChild(tdTime);
    tr.appendChild(tdSub);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);
}

/** Тиждень — блоки за днями */
function renderWeek(weekObj, todayName){
  const container = document.getElementById('week');
  container.innerHTML = "";

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

    const arr = [...items].sort((a,b)=> a.time.localeCompare(b.time));
    arr.forEach(it => {
      const tr = document.createElement('tr');
      if(day === todayName) tr.classList.add('schedule__today-row');

      const tdTime = document.createElement('td');
      tdTime.textContent = it.time || '—';

      const tdSub = createSubjectCell(it.subject, it.room, it.link);

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

/** Захист від XSS (для відображуваного тексту) */
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

// Темна тема (кнопка)
function initThemeToggle(btn){
  if(!btn) return;

  btn.addEventListener("click", () => {
    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");
    btn.textContent = isDark ? "☀️" : "🌙";

    // синхронізуємо всі кнопки
    document
      .querySelectorAll(".theme-toggle")
      .forEach(b => b.textContent = btn.textContent);
  });
}

function normalizeSubject(subject) {
  if (!subject) return subject;

  if (subject.toLowerCase().includes("оркестр")) {
    return "Оркестр";
  }if (subject.toLowerCase().includes("ансамбль")) {
    return "Ансамбль";
  }if (subject.toLowerCase().includes("хор")) {
    return "Хор";
  }

  return subject;
}

initThemeToggle(document.getElementById("themeToggle"));
initThemeToggle(document.getElementById("themeToggleOnboarding"));

