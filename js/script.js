async function loadSchedule() {
  const response = await fetch('data/schedule.json');
  const data = await response.json();

  const days = ["Неділя","Понеділок","Вівторок","Середа","Четвер","П’ятниця","Субота"];
  const todayName = days[new Date().getDay()];

  const todayData = data.week.filter(item => item.day === todayName);

  renderToday(todayData);
  renderWeek(data.week, todayName);
}

function renderToday(today) {
  const container = document.getElementById('today');
  if(today.length === 0){
    container.innerHTML = "<p>Сьогодні пар немає.</p>";
    return;
  }

  let html = `
    <table class="schedule__table">
      <tr><th>Час</th><th>Предмет</th></tr>
  `;
  today.forEach(item => {
    html += `<tr><td>${item.time}</td><td>${item.subject}</td></tr>`;
  });
  html += '</table>';
  container.innerHTML = html;
}

// Оновлений renderWeek з блоками за дні
function renderWeek(week, todayName) {
  const container = document.getElementById('week');
  container.innerHTML = ""; // очищаємо контейнер перед рендером

  // Групуємо по днях
  const daysMap = {};
  week.forEach(item => {
    if(!daysMap[item.day]) daysMap[item.day] = [];
    daysMap[item.day].push(item);
  });

  const daysOrder = ["Понеділок","Вівторок","Середа","Четвер","П’ятниця","Субота","Неділя"];
  daysOrder.forEach(day => {
    if(daysMap[day]) {
      const dayBlock = document.createElement('div');
      dayBlock.classList.add('week-day-block');

      const dayTitle = document.createElement('h3');
      dayTitle.innerText = day;
      if(day === todayName) dayTitle.style.color = "#007bff";
      dayBlock.appendChild(dayTitle);

      const table = document.createElement('table');
      table.classList.add('schedule__table');
      const header = table.insertRow();
      header.insertCell().innerText = "Час";
      header.insertCell().innerText = "Предмет";

      daysMap[day].forEach(item => {
        const row = table.insertRow();
        row.insertCell().innerText = item.time;
        row.insertCell().innerText = item.subject;
        if(day === todayName) row.classList.add('schedule__today-row');
      });

      dayBlock.appendChild(table);
      container.appendChild(dayBlock);
    }
  });
}

function showSchedule(id, event) {
  document.querySelectorAll('.schedule').forEach(el => el.classList.remove('schedule--active'));
  document.querySelectorAll('.controls__button').forEach(el => el.classList.remove('controls__button--active'));

  document.getElementById(id).classList.add('schedule--active');
  event.target.classList.add('controls__button--active');
}

// кнопка "Оновити"
function refreshSchedule() {
  loadSchedule();
}

// завантажуємо дані при старті
loadSchedule();
