import { api, request } from './api.js';

let currentTab = 'ALL';
let currentCalendarData: any = null;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export async function loadCalendarView(forceRefresh = false) {
  const container = document.getElementById('calendar-container');
  const tabsContainer = document.getElementById('calendar-sources-tabs');
  if (!container || !tabsContainer) return;

  if (forceRefresh) {
    container.innerHTML = '<div class="terminal-loader"><span class="loader-text">REFRESHING FEED...</span><span class="cursor">_</span></div>';
  } else if (!currentCalendarData) {
    container.innerHTML = '<div class="terminal-loader"><span class="loader-text">FETCHING CALENDARS...</span><span class="cursor">_</span></div>';
  }

  try {
    const data = await request<any>(`/api/calendar${forceRefresh ? '?force=true' : ''}`);
    currentCalendarData = data;
    renderCalendarTabs(data);
    renderCalendarDays(data, currentTab);
  } catch (err: any) {
    container.textContent = 'Calendar could not be loaded. Please retry.';
  }
}

function renderCalendarTabs(data: any) {
  const tabsContainer = document.getElementById('calendar-sources-tabs');
  if (!tabsContainer) return;

  const allSources = data.sources || [];

  let html = `<button class="tab-btn ${currentTab === 'ALL' ? 'active' : ''}" data-source="ALL">ALL</button>`;
  allSources.forEach((s: string) => {
    const hasError = !!data.errors?.[s];
    html += `<button class="tab-btn ${currentTab === s ? 'active' : ''}" data-source="${escape(s)}">${escape(s.toUpperCase())} ${hasError ? '⚠️' : ''}</button>`;
  });

  tabsContainer.innerHTML = html;

  tabsContainer.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.getAttribute('data-source') || 'ALL';
      renderCalendarTabs(currentCalendarData);
      renderCalendarDays(currentCalendarData, currentTab);
    });
  });
}

function renderCalendarDays(data: any, filterSource: string) {
  const container = document.getElementById('calendar-container');
  if (!container) return;

  if (filterSource !== 'ALL' && data.errors && data.errors[filterSource]) {
    container.innerHTML = `<div class="error-panel" style="margin-bottom: 1rem;"><h3>SOURCE ERROR: ${escape(filterSource)}</h3><p>${escape(data.errors[filterSource])}</p></div>`;
    return;
  }

  if (!data.days || Object.keys(data.days).length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 2rem;">No upcoming events.</div>';
    return;
  }

  let html = '';
  
  const days = Object.keys(data.days).sort();
  let hasEvents = false;

  for (const day of days) {
    let events = data.days[day];
    if (filterSource !== 'ALL') {
      events = events.filter((e: any) => e.sourceKey === filterSource);
    }
    
    if (events.length === 0) continue;
    hasEvents = true;

    // Parse date for display
    // day format is YYYY-MM-DD
    const [y, m, d] = day.split('-');
    const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    const shortDate = `${m}/${d}`;

    html += `
      <div class="calendar-day-group">
        <h3 style="color: var(--accent-cyan); border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem; margin-bottom: 0.75rem; font-size: 1.1rem;">
          ${dayName} <span style="color: var(--text-muted); font-size: 0.9rem;">${shortDate}</span>
        </h3>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
    `;

    for (const evt of events) {
      html += `
          <div class="task-card" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem;">
            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
              <div style="font-weight: 500; font-size: 1.05rem;">${escape(evt.formattedEntry)}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">${evt.isAllDay ? 'ALL DAY' : escape(evt.timeStr || '')}</div>
            </div>
            <button class="cyber-btn btn-add-today" data-entry="${escape(evt.formattedEntry)}" style="padding: 4px 10px; font-size: 0.8em; white-space: nowrap;">ADD TO TODAY</button>
          </div>
      `;
    }

    html += `
        </div>
      </div>
    `;
  }

  if (!hasEvents) {
    html = '<div style="color: var(--text-muted); text-align: center; padding: 2rem;">No upcoming events for this source.</div>';
  }

  container.innerHTML = html;

  container.querySelectorAll('.btn-add-today').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const entry = (e.target as HTMLElement).getAttribute('data-entry');
      if (entry) {
        try {
          const originalText = (e.target as HTMLElement).innerText;
          (e.target as HTMLElement).innerText = 'ADDING...';
          (e.target as HTMLElement).setAttribute('disabled', 'true');
          
          await api.addTask(entry, 'have_to', 'today', 'calendar');
          
          (e.target as HTMLElement).innerText = 'ADDED';
          (e.target as HTMLElement).classList.add('cyan');
        } catch (err) {
          (e.target as HTMLElement).innerText = 'ERROR';
          (e.target as HTMLElement).removeAttribute('disabled');
        }
      }
    });
  });
}

export function initCalendarView() {
  document.getElementById('btn-refresh-calendar')?.addEventListener('click', () => {
    loadCalendarView(true);
  });
}
