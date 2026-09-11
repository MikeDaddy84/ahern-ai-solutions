import { api, TaskItem, TodayResponse, HistoryItem, setOnUnauthorized } from './api.js';
import { initMatrixRain, triggerMatrixCelebration } from './components/rain.js';
import { loadCalendarView, initCalendarView } from './calendarView.js';

let currentView: 'today' | 'backlog' | 'history' | 'calendar' = 'today';
let celebrationFiredToday = false;

// Register Service Worker for PWA
if ('serviceWorker' in navigator && !document.querySelector('.satori-host')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration failed:', err);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMatrixRain('bg-canvas');
  setupEventListeners();
  setOnUnauthorized(showLoginModal);
  initCalendarView();

  checkAuthAndLoad();
});

async function checkAuthAndLoad() {
  try {
    const auth = await api.checkAuth();
    if (!auth.authenticated) {
      showLoginModal();
    } else {
      hideLoginModal();
      loadActiveView();
      loadCalendarView();
    }
  } catch (e) {
    showLoginModal();
  }
}

function setupEventListeners() {
  // Navigation tabs & mobile bottom nav
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = (e.currentTarget as HTMLElement).getAttribute('data-view') as 'today' | 'backlog' | 'history';
      switchView(target);
    });
  });

  // Action buttons
  document.getElementById('btn-new-day')?.addEventListener('click', handleManualRollover);
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('fab-add-task')?.addEventListener('click', openAddTaskModal);

  // Add Task Modal
  document.getElementById('btn-cancel-task')?.addEventListener('click', closeAddTaskModal);
  document.getElementById('btn-save-task')?.addEventListener('click', handleSaveTask);

  // Login Modal
  document.getElementById('btn-submit-login')?.addEventListener('click', handleLoginSubmit);
  document.getElementById('input-login-password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLoginSubmit();
  });

  // Retry Button
  document.getElementById('btn-retry')?.addEventListener('click', loadActiveView);
  
  // History Pagination
  document.getElementById('btn-load-more')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-load-more') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerText = 'LOADING...';
    try {
      await renderHistoryView(currentHistoryOffset + 7);
    } catch (err: any) {
      showStatus('error', err.message || 'Failed to load history data.');
    } finally {
      btn.disabled = false;
      btn.innerText = 'LOAD MORE HISTORY';
    }
  });

  // Task Input Counter
  const taskInput = document.getElementById('input-task-text') as HTMLInputElement;
  const charCounter = document.getElementById('task-char-counter') as HTMLDivElement;
  taskInput?.addEventListener('input', () => {
    charCounter.innerText = `${taskInput.value.length}/200`;
  });

  // Keyboard accessibility for checkboxes (Enter key) - Using delegation
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target && target.classList.contains('task-checkbox') && e.key === 'Enter') {
      e.preventDefault();
      target.click(); // Trigger native toggle
    }
  });
}

export function showStatus(type: 'loading' | 'error', message?: string) {
  const viewStatus = document.getElementById('view-status');
  const spinner = document.getElementById('status-spinner');
  const errorPanel = document.getElementById('status-error');
  const errorMsg = document.getElementById('error-message');
  
  if (viewStatus) viewStatus.classList.remove('hidden');
  
  // Hide active content views
  document.getElementById('view-today')?.classList.add('hidden');
  document.getElementById('view-backlog')?.classList.add('hidden');
  document.getElementById('view-history')?.classList.add('hidden');
  document.getElementById('view-calendar')?.classList.add('hidden');

  if (type === 'loading') {
    if (spinner) spinner.classList.remove('hidden');
    if (errorPanel) errorPanel.classList.add('hidden');
  } else if (type === 'error') {
    if (spinner) spinner.classList.add('hidden');
    if (errorPanel) errorPanel.classList.remove('hidden');
    if (errorMsg) errorMsg.innerText = message || 'Unknown error';
  }
}

function hideStatus() {
  const viewStatus = document.getElementById('view-status');
  if (viewStatus) viewStatus.classList.add('hidden');
  
  // Restore current view visibility
  document.getElementById(`view-${currentView}`)?.classList.remove('hidden');
}

let loaderTimer: any;
function startLoading() {
  const loaderText = document.getElementById('loader-text');
  if (loaderText) loaderText.innerText = 'ESTABLISHING CONNECTION...';
  showStatus('loading');
  
  loaderTimer = setTimeout(() => {
    if (loaderText) loaderText.innerText = 'DECRYPTING...';
  }, 8000);
}

function stopLoading() {
  clearTimeout(loaderTimer);
  hideStatus();
}

function switchView(view: 'today' | 'backlog' | 'history' | 'calendar') {
  currentView = view;

  // Update tab highlights
  document.querySelectorAll('[data-view]').forEach((btn) => {
    if (btn.getAttribute('data-view') === view) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle view visibility
  document.getElementById('view-today')?.classList.toggle('hidden', view !== 'today');
  document.getElementById('view-backlog')?.classList.toggle('hidden', view !== 'backlog');
  document.getElementById('view-history')?.classList.toggle('hidden', view !== 'history');
  document.getElementById('view-calendar')?.classList.toggle('hidden', view !== 'calendar');

  loadActiveView();
}

export async function loadActiveView() {
  if (!navigator.onLine) {
    showStatus('error', 'NETWORK OFFLINE: Please check your connection.');
    return;
  }
  
  startLoading();
  try {
    switch (currentView) {
      case 'today':
        await renderTodayView();
        break;
      case 'backlog':
        await renderBacklogView();
        break;
      case 'history':
        currentHistoryOffset = 0;
        await renderHistoryView(0);
        break;
      case 'calendar':
        // If they click calendar, it might already be loaded in background, but we can call it again
        if (!document.getElementById('calendar-sources-tabs')?.hasChildNodes()) {
          await loadCalendarView();
        }
        break;
    }
    stopLoading();
  } catch (err: any) {
    stopLoading();
    showStatus('error', `Failed to load ${currentView.toUpperCase()} view: ${err.message || 'Unknown error'}`);
  }
}

export async function renderTodayView() {
  const data: TodayResponse = await api.getToday();

  // Update Header Date
  const headerDate = document.getElementById('header-date');
  if (headerDate) {
    headerDate.innerText = `Agenda for Today ~ ${formatPrettyDateKey(data.dayKey)}`;
  }

  // Render counts
  const countHave = document.getElementById('count-have_to');
  if (countHave) countHave.innerText = `${data.counts.have_to.total - data.counts.have_to.remaining}/${data.counts.have_to.total}`;

  const countNeed = document.getElementById('count-need_to');
  if (countNeed) countNeed.innerText = `${data.counts.need_to.total - data.counts.need_to.remaining}/${data.counts.need_to.total}`;

  const countWant = document.getElementById('count-want_to');
  if (countWant) countWant.innerText = `${data.counts.want_to.total - data.counts.want_to.remaining}/${data.counts.want_to.total}`;

  // Render lists
  renderTaskList('list-have_to', data.categories.have_to);
  renderTaskList('list-need_to', data.categories.need_to);
  renderTaskList('list-want_to', data.categories.want_to);
}

function attachEditEvents(div: HTMLElement, task: TaskItem, refresh: () => Promise<void>) {
  const viewMode = div.querySelector('.task-view-mode') as HTMLElement;
  const editMode = div.querySelector('.task-edit-mode') as HTMLElement;
  const editBtn = div.querySelector('[data-edit-id]') as HTMLButtonElement;
  const cancelBtn = div.querySelector('.edit-cancel') as HTMLButtonElement;
  const saveBtn = div.querySelector('.edit-save') as HTMLButtonElement;
  const textInput = div.querySelector('.edit-text-input') as HTMLInputElement;
  const typeSelect = div.querySelector('.edit-type-select') as HTMLSelectElement;
  const charCounter = div.querySelector('.edit-char-counter') as HTMLSpanElement;

  const errorSpan = div.querySelector('.edit-error') as HTMLSpanElement;

  if (!editBtn || !editMode || !viewMode || !textInput) return;

  const showError = (msg: string) => {
    if (errorSpan) {
      errorSpan.innerText = msg;
      errorSpan.style.display = 'block';
    }
  };

  editBtn.addEventListener('click', () => {
    viewMode.style.display = 'none';
    editMode.style.display = 'flex';
    textInput.focus();
  });

  const closeEdit = () => {
    textInput.value = task.text;
    typeSelect.value = task.type;
    charCounter.innerText = `${task.text.length}/200`;
    if (errorSpan) {
      errorSpan.innerText = '';
      errorSpan.style.display = 'none';
    }
    
    editMode.style.display = 'none';
    viewMode.style.display = 'flex';
    if (editBtn) editBtn.focus();
  };

  if (cancelBtn) cancelBtn.addEventListener('click', closeEdit);

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEdit();
    if (e.key === 'Enter') saveBtn.click();
  });
  typeSelect.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEdit();
    if (e.key === 'Enter') saveBtn.click();
  });

  textInput.addEventListener('input', () => {
    charCounter.innerText = `${textInput.value.length}/200`;
  });

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const newText = textInput.value.trim();
      const newType = typeSelect.value as 'have_to' | 'need_to' | 'want_to';

      if (!newText) {
        showError('Task text cannot be empty');
        textInput.focus();
        return;
      }
      if (newText.length > 200) {
        showError('Task text exceeds maximum length of 200 characters');
        textInput.focus();
        return;
      }
      if (newText === task.text && newType === task.type) {
        closeEdit();
        return;
      }

      if (!navigator.onLine) {
        showError('NETWORK OFFLINE: Cannot update task.');
        return;
      }

      div.style.opacity = '0.5';

      try {
        await api.updateTask(task.id, { text: newText, type: newType });
        await refresh();
      } catch (err: any) {
        div.style.opacity = '1';
        showError(err.message || 'Failed to update task.');
      }
    });
  }
}

export function renderTaskList(containerId: string, items: TaskItem[]) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem;">No tasks</div>';
    return;
  }

  items.forEach((task) => {
    const div = document.createElement('div');
    div.className = `task-item ${task.status === 'done' ? 'done' : ''}`;

    const isChecked = task.status === 'done';

    div.innerHTML = `
      <div class="task-view-mode" style="display: flex; width: 100%; justify-content: space-between; align-items: center;">
        <label class="task-left custom-checkbox-wrapper">
          <input type="checkbox" class="task-checkbox" ${isChecked ? 'checked' : ''} data-id="${task.id}" data-type="${task.type}">
          <div class="checkbox-box">
            <svg viewBox="0 0 24 24" class="check-svg"><path d="M4 12l5 5L20 6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span class="task-text">${escapeHtml(task.text)}</span>
        </label>
        <div class="task-actions">
          <button class="icon-btn edit" data-edit-id="${task.id}" title="Edit Task" aria-label="Edit task">✏️</button>
          ${task.source === 'calendar' ? '' : `<button class="icon-btn backlog" data-backlog-id="${task.id}" title="Send to Backlog" aria-label="Send to backlog">📥</button>`}
          <button class="icon-btn delete" data-delete-id="${task.id}" title="Delete Task">✕</button>
        </div>
      </div>
      <div class="task-edit-mode" style="display: none; width: 100%; gap: 0.5rem; flex-direction: column;">
        <div style="display: flex; gap: 0.5rem; align-items: center; width: 100%;">
          <input type="text" class="cyber-input edit-text-input" value="${escapeHtml(task.text)}" maxlength="200" style="flex: 1; padding: 0.4rem; font-size: 0.95rem;">
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: space-between;">
          <select class="cyber-select edit-type-select" style="padding: 0.2rem; font-size: 0.85rem; width: auto;">
            <option value="have_to" ${task.type === 'have_to' ? 'selected' : ''}>Have To</option>
            <option value="need_to" ${task.type === 'need_to' ? 'selected' : ''}>Need To</option>
            <option value="want_to" ${task.type === 'want_to' ? 'selected' : ''}>Want To</option>
          </select>
          <div style="display: flex; gap: 0.5rem;">
            <span class="edit-error" style="font-size: 0.75rem; color: var(--accent-red); align-self: center; display: none;"></span>
            <span class="edit-char-counter" style="font-size: 0.75rem; color: var(--text-muted); align-self: center;">${task.text.length}/200</span>
            <button class="cyber-btn edit-cancel" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">CANCEL</button>
            <button class="cyber-btn cyan edit-save" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">SAVE</button>
          </div>
        </div>
      </div>
    `;

    attachEditEvents(div, task, renderTodayView);

    // Checkbox toggle event
    const checkbox = div.querySelector('.task-checkbox') as HTMLInputElement;
    checkbox.addEventListener('change', async (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      await toggleTaskStatus(task.id, checked, task.type);
    });

    // Backlog event
    const backlogBtn = div.querySelector('[data-backlog-id]') as HTMLButtonElement;
    if (backlogBtn) {
      backlogBtn.addEventListener('click', async () => {
        if (!navigator.onLine) {
          showStatus('error', 'NETWORK OFFLINE: Cannot update task.');
          return;
        }
        
        // Optimistic UI Update
        div.style.display = 'none';
        
        try {
          await api.updateTask(task.id, { status: 'backlog' });
          await renderTodayView();
        } catch (err: any) {
          console.error('Failed to send task to backlog:', err);
          // Rollback visual state
          div.style.display = '';
          showStatus('error', err.message || 'Failed to send task to backlog.');
        }
      });
    }

    // Delete event
    const deleteBtn = div.querySelector('[data-delete-id]') as HTMLButtonElement;
    deleteBtn.addEventListener('click', async () => {
      if (confirm(`Delete "${task.text}"?`)) {
        startLoading();
        try {
          await api.deleteTask(task.id);
          await renderTodayView();
          stopLoading();
        } catch (err: any) {
          stopLoading();
          showStatus('error', err.message || 'Failed to delete task.');
        }
      }
    });

    container.appendChild(div);
  });
}

export async function toggleTaskStatus(id: string, isChecked: boolean, type: 'have_to' | 'need_to' | 'want_to') {
  if (!navigator.onLine) {
    showStatus('error', 'NETWORK OFFLINE: Cannot update task.');
    // Revert visual state
    await renderTodayView();
    return;
  }
  
  // Optimistic UI Update
  const checkbox = document.querySelector(`input[data-id="${id}"]`) as HTMLInputElement;
  const taskItem = checkbox?.closest('.task-item');
  if (checkbox) checkbox.checked = isChecked;
  if (taskItem) {
    if (isChecked) taskItem.classList.add('done');
    else taskItem.classList.remove('done');
  }

  try {
    await api.updateTask(id, { status: isChecked ? 'done' : 'today' });
    await renderTodayView();

    // Check celebration condition if Have To task was checked
    if (type === 'have_to' && isChecked) {
      const todayData = await api.getToday();
      if (todayData.counts.have_to.remaining === 0 && todayData.counts.have_to.total > 0) {
        if (!celebrationFiredToday) {
          triggerMatrixCelebration();
          celebrationFiredToday = true;
        }
      }
    }
  } catch (err: any) {
    console.error('Failed to toggle task status:', err);
    // Rollback visual state
    if (checkbox) checkbox.checked = !isChecked;
    if (taskItem) {
      if (!isChecked) taskItem.classList.add('done');
      else taskItem.classList.remove('done');
    }
    showStatus('error', err.message || 'Failed to update task.');
  }
}

async function renderBacklogView() {
  const items = await api.getBacklog();
  const container = document.getElementById('list-backlog');
  const countBadge = document.getElementById('count-backlog');

  if (countBadge) countBadge.innerText = `${items.length} Items`;
  if (!container) return;

  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem; padding: 1rem;">Backlog is empty. All caught up!</div>';
    return;
  }

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'task-item';

    const typeLabel = item.type === 'have_to' ? 'Have To' : item.type === 'need_to' ? 'Need To' : 'Want To';
    const typeColor = item.type === 'have_to' ? 'var(--text-primary)' : item.type === 'need_to' ? 'var(--accent-cyan)' : 'var(--accent-magenta)';

    div.innerHTML = `
      <div class="task-view-mode" style="display: flex; width: 100%; justify-content: space-between; align-items: center;">
        <div class="task-left">
          <span style="font-size: 0.75rem; padding: 0.15rem 0.4rem; border: 1px solid ${typeColor}; color: ${typeColor}; border-radius: 4px; flex-shrink: 0;">${typeLabel}</span>
          <span class="task-text">${escapeHtml(item.text)}</span>
        </div>
        <div class="task-actions">
          <button class="icon-btn edit" data-edit-id="${item.id}" title="Edit Task" aria-label="Edit task">✏️</button>
          <button class="cyber-btn cyan" style="font-size: 0.7rem; padding: 0.2rem 0.5rem;" data-pull-id="${item.id}">PULL TO TODAY</button>
          <button class="icon-btn delete" data-delete-id="${item.id}" title="Delete Task">✕</button>
        </div>
      </div>
      <div class="task-edit-mode" style="display: none; width: 100%; gap: 0.5rem; flex-direction: column;">
        <div style="display: flex; gap: 0.5rem; align-items: center; width: 100%;">
          <input type="text" class="cyber-input edit-text-input" value="${escapeHtml(item.text)}" maxlength="200" style="flex: 1; padding: 0.4rem; font-size: 0.95rem;">
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: space-between;">
          <select class="cyber-select edit-type-select" style="padding: 0.2rem; font-size: 0.85rem; width: auto;">
            <option value="have_to" ${item.type === 'have_to' ? 'selected' : ''}>Have To</option>
            <option value="need_to" ${item.type === 'need_to' ? 'selected' : ''}>Need To</option>
            <option value="want_to" ${item.type === 'want_to' ? 'selected' : ''}>Want To</option>
          </select>
          <div style="display: flex; gap: 0.5rem;">
            <span class="edit-error" style="font-size: 0.75rem; color: var(--accent-red); align-self: center; display: none;"></span>
            <span class="edit-char-counter" style="font-size: 0.75rem; color: var(--text-muted); align-self: center;">${item.text.length}/200</span>
            <button class="cyber-btn edit-cancel" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">CANCEL</button>
            <button class="cyber-btn cyan edit-save" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">SAVE</button>
          </div>
        </div>
      </div>
    `;

    attachEditEvents(div, item, renderBacklogView);

    div.querySelector('[data-pull-id]')?.addEventListener('click', async () => {
      startLoading();
      try {
        await api.updateTask(item.id, { status: 'today' });
        await renderBacklogView();
        stopLoading();
      } catch (err: any) {
        stopLoading();
        showStatus('error', err.message || 'Failed to pull task.');
      }
    });

    div.querySelector('[data-delete-id]')?.addEventListener('click', async () => {
      if (confirm(`Delete "${item.text}" from backlog?`)) {
        startLoading();
        try {
          await api.deleteTask(item.id);
          await renderBacklogView();
          stopLoading();
        } catch (err: any) {
          stopLoading();
          showStatus('error', err.message || 'Failed to delete task.');
        }
      }
    });

    container.appendChild(div);
  });
}

let currentHistoryOffset = 0;

export async function renderHistoryView(offset = 0) {
  currentHistoryOffset = offset;
  const data = await api.getHistory(7, offset);
  const container = document.getElementById('list-history');
  const loadMoreBtn = document.getElementById('btn-load-more');
  if (!container) return;

  if (offset === 0) {
    container.innerHTML = '';
    if (data.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 1rem;">No history log snapshots found yet.</div>';
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }
  }

  if (loadMoreBtn) {
    if (data.length < 7) {
      loadMoreBtn.style.display = 'none';
    } else {
      loadMoreBtn.style.display = 'block';
    }
  }

  data.forEach((log: any) => {
    const card = document.createElement('div');
    card.style.cssText = 'background: rgba(0,0,0,0.5); border: 1px solid var(--border-green); border-radius: 6px; padding: 1rem;';

    const prettyDate = formatPrettyDateKey(log.dayKey);
    const tasks = log.summary.tasks || [];
    const doneCount = tasks.filter((t: any) => t.status === 'done').length;

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <h4 style="color: var(--accent-cyan); font-size: 1rem;">${prettyDate}</h4>
        <span style="font-size: 0.85rem; color: var(--text-muted);">${doneCount}/${tasks.length} Done</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.4rem;">
        ${tasks.map((t: any) => `
          <div style="font-size: 0.85rem; color: ${t.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)'}; text-decoration: ${t.status === 'done' ? 'line-through' : 'none'};">
            • [${t.type.toUpperCase()}] ${escapeHtml(t.text)}
          </div>
        `).join('')}
      </div>
    `;

    container.appendChild(card);
  });
}

async function handleManualRollover() {
  if (confirm('Run New Day Rollover now? This will snapshot yesterday, carry over tasks, import calendar, and pull from backlog.')) {
    startLoading();
    try {
      const res = await api.triggerRollover();
      showStatus('loading'); // Just to clear it briefly
      if (res.executed) {
        await loadActiveView();
        // Load calendar in background
        loadCalendarView();
      }
      stopLoading();
    } catch (err: any) {
      stopLoading();
      showStatus('error', `Rollover failed: ${err.message}`);
    }
  }
}

let previouslyFocusedElement: HTMLElement | null = null;

function handleModalTab(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const modal = document.getElementById('modal-add-task');
  if (!modal || modal.classList.contains('hidden')) return;

  const focusable = modal.querySelectorAll('input, select, button, textarea, a[href], [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;

  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function openAddTaskModal() {
  previouslyFocusedElement = document.activeElement as HTMLElement;
  const modal = document.getElementById('modal-add-task');
  const input = document.getElementById('input-task-text') as HTMLInputElement;
  const error = document.getElementById('modal-error');
  const counter = document.getElementById('task-char-counter');
  
  if (modal) {
    modal.classList.remove('hidden');
    document.addEventListener('keydown', handleModalTab);
  }
  if (error) error.innerText = '';
  if (counter) counter.innerText = '0/200';
  if (input) {
    input.value = '';
    input.focus();
  }
}

function closeAddTaskModal() {
  const modal = document.getElementById('modal-add-task');
  if (modal) {
    modal.classList.add('hidden');
    document.removeEventListener('keydown', handleModalTab);
  }
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus();
  }
}

async function handleSaveTask() {
  const textInput = document.getElementById('input-task-text') as HTMLInputElement;
  const typeSelect = document.getElementById('select-task-type') as HTMLSelectElement;
  const targetSelect = document.getElementById('select-task-target') as HTMLSelectElement;
  const errorDiv = document.getElementById('modal-error');

  const text = textInput.value.trim();
  const type = typeSelect.value as 'have_to' | 'need_to' | 'want_to';
  const target = targetSelect.value as 'today' | 'backlog';

  if (!text) {
    if (errorDiv) errorDiv.innerText = 'Please enter a task description';
    textInput.focus();
    return;
  }
  
  if (text.length > 200) {
    if (errorDiv) errorDiv.innerText = 'Task text exceeds maximum length of 200 characters';
    textInput.focus();
    return;
  }

  try {
    if (errorDiv) errorDiv.innerText = '';
    await api.addTask(text, type, target);
    closeAddTaskModal();
    await loadActiveView();
  } catch (err: any) {
    if (errorDiv) errorDiv.innerText = `Failed to add task: ${err.message}`;
  }
}

function showLoginModal() {
  if (document.querySelector('.satori-host')) { window.location.assign('/login'); return; }
  document.getElementById('modal-login')?.classList.remove('hidden');
}

function hideLoginModal() {
  document.getElementById('modal-login')?.classList.add('hidden');
}

async function handleLoginSubmit() {
  const input = document.getElementById('input-login-password') as HTMLInputElement;
  const errorMsg = document.getElementById('login-error-msg');
  const password = input.value;

  if (!password) return;

  try {
    const res = await api.login(password);
    if (res.success) {
      hideLoginModal();
      if (errorMsg) errorMsg.style.display = 'none';
      input.value = '';
      await loadActiveView();
    }
  } catch (err) {
    if (errorMsg) errorMsg.style.display = 'block';
  }
}

async function handleLogout() {
  if (confirm('Log out of Satori Portal?')) {
    await api.logout();
    window.location.assign('/login');
  }
}

export function formatPrettyDateKey(dayKey: string): string {
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return dayKey;
  const [year, month, day] = dayKey.split('-').map((n) => parseInt(n, 10));
  const date = new Date(year, month - 1, day);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const ordinal = getOrdinal(day);

  return `${dayName}, ${monthName} ${day}${ordinal} ${year}`;
}

export function getOrdinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
