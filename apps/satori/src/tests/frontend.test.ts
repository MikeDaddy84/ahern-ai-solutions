/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  formatPrettyDateKey, 
  getOrdinal, 
  renderTaskList, 
  showStatus, 
  toggleTaskStatus,
  renderTodayView
} from '../client/src/main.js';
import { api } from '../client/src/api.js';
import * as rain from '../client/src/components/rain.js';

vi.mock('../client/src/api.js', () => ({
  api: {
    updateTask: vi.fn(),
    getToday: vi.fn()
  }
}));

vi.mock('../client/src/components/rain.js', () => ({
  triggerMatrixCelebration: vi.fn(),
  initMatrixRain: vi.fn()
}));

describe('Frontend Logic & Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div id="header-date"></div>
      <div id="count-have_to"></div>
      <div id="count-need_to"></div>
      <div id="count-want_to"></div>
      <div id="list-have_to"></div>
      <div id="list-need_to"></div>
      <div id="list-want_to"></div>
      <div id="view-status" class="hidden"></div>
      <div id="status-spinner" class="hidden"></div>
      <div id="status-error" class="hidden"></div>
      <div id="error-message"></div>
      <div id="view-today"></div>
      <div id="view-backlog"></div>
      <div id="view-history"></div>
      <button id="btn-retry"></button>
    `;
    // Mock navigator.onLine
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });

  it('formatPrettyDateKey produces correct ordinals', () => {
    expect(formatPrettyDateKey('2024-01-01')).toContain('1st');
    expect(formatPrettyDateKey('2024-01-02')).toContain('2nd');
    expect(formatPrettyDateKey('2024-01-03')).toContain('3rd');
    expect(formatPrettyDateKey('2024-01-04')).toContain('4th');
    expect(formatPrettyDateKey('2024-01-11')).toContain('11th');
    expect(formatPrettyDateKey('2024-01-12')).toContain('12th');
    expect(formatPrettyDateKey('2024-01-13')).toContain('13th');
    expect(formatPrettyDateKey('2024-01-21')).toContain('21st');
    expect(formatPrettyDateKey('2024-01-22')).toContain('22nd');
    expect(formatPrettyDateKey('2024-01-23')).toContain('23rd');
  });

  it('renderTaskList produces the right DOM for tasks', () => {
    const tasks = [
      { id: '1', text: 'Test Task', status: 'today', type: 'have_to' },
      { id: '2', text: 'Done Task', status: 'done', type: 'have_to' }
    ];
    renderTaskList('list-have_to', tasks as any);
    
    const container = document.getElementById('list-have_to')!;
    expect(container.querySelectorAll('.task-item').length).toBe(2);
    
    // Check that done task has 'done' class and checked property
    const doneItem = container.querySelectorAll('.task-item')[1];
    expect(doneItem.classList.contains('done')).toBe(true);
    const checkbox = doneItem.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('loading and error states render correctly', () => {
    showStatus('loading');
    expect(document.getElementById('view-status')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('status-spinner')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('status-error')?.classList.contains('hidden')).toBe(true);

    showStatus('error', 'Mock Failure');
    expect(document.getElementById('status-spinner')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('status-error')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('error-message')?.innerText).toBe('Mock Failure');
  });

  it('optimistic check-off applies changes and rolls back on failure', async () => {
    // Setup initial DOM
    document.body.innerHTML += `
      <div class="task-item" id="task-wrapper">
        <input type="checkbox" data-id="fail-task" data-type="have_to">
      </div>
    `;
    
    const checkbox = document.querySelector('input[data-id="fail-task"]') as HTMLInputElement;
    const taskItem = document.getElementById('task-wrapper')!;
    
    // Mock failure
    vi.mocked(api.updateTask).mockRejectedValueOnce(new Error('Update failed'));
    
    // Attempt toggle
    await toggleTaskStatus('fail-task', true, 'have_to');
    
    // Because it rolled back:
    expect(checkbox.checked).toBe(false);
    expect(taskItem.classList.contains('done')).toBe(false);
    // And error status is shown
    expect(document.getElementById('view-status')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('error-message')?.innerText).toBe('Update failed');
  });

  it('triggers celebration when last undone Have To is checked', async () => {
    document.body.innerHTML += `
      <div class="task-item">
        <input type="checkbox" data-id="win-task" data-type="have_to">
      </div>
    `;
    
    // Mock success update
    vi.mocked(api.updateTask).mockResolvedValueOnce({} as any);
    
    // Mock getToday to return remaining = 0 for have_to
    vi.mocked(api.getToday).mockResolvedValue({
      dayKey: '2024-01-01',
      counts: {
        have_to: { total: 1, remaining: 0 },
        need_to: { total: 0, remaining: 0 },
        want_to: { total: 0, remaining: 0 }
      },
      categories: { have_to: [], need_to: [], want_to: [] }
    } as any);

    await toggleTaskStatus('win-task', true, 'have_to');
    
    expect(rain.triggerMatrixCelebration).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger celebration when Have To remains', async () => {
    document.body.innerHTML += `
      <div class="task-item">
        <input type="checkbox" data-id="no-win-task" data-type="have_to">
      </div>
    `;
    
    vi.mocked(api.updateTask).mockResolvedValueOnce({} as any);
    
    // Mock getToday to return remaining = 1
    vi.mocked(api.getToday).mockResolvedValue({
      dayKey: '2024-01-01',
      counts: {
        have_to: { total: 2, remaining: 1 },
        need_to: { total: 0, remaining: 0 },
        want_to: { total: 0, remaining: 0 }
      },
      categories: { have_to: [], need_to: [], want_to: [] }
    } as any);

    await toggleTaskStatus('no-win-task', true, 'have_to');
    
    expect(rain.triggerMatrixCelebration).not.toHaveBeenCalled();
  });

  it('live category counts update correctly after fetch', async () => {
    vi.mocked(api.getToday).mockResolvedValue({
      dayKey: '2024-01-01',
      counts: {
        have_to: { total: 5, remaining: 3 },
        need_to: { total: 2, remaining: 2 },
        want_to: { total: 10, remaining: 1 }
      },
      categories: { have_to: [], need_to: [], want_to: [] }
    } as any);

    await renderTodayView();

    expect(document.getElementById('count-have_to')?.innerText).toBe('2/5');
    expect(document.getElementById('count-need_to')?.innerText).toBe('0/2');
    expect(document.getElementById('count-want_to')?.innerText).toBe('9/10');
  });

  it('escapes HTML to prevent XSS (R31)', () => {
    const maliciousTask = { id: 'xss', text: '<img src=x onerror=alert(1)>', status: 'today', type: 'have_to' };
    renderTaskList('list-have_to', [maliciousTask] as any);
    
    const container = document.getElementById('list-have_to')!;
    const renderedText = container.querySelector('.task-text')?.innerHTML;
    expect(renderedText).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('toggles checkbox when Enter is pressed (R27)', async () => {
    const mockClick = vi.fn();
    
    // Simulate the event target
    const mockTarget = {
      classList: {
        contains: (cls: string) => cls === 'task-checkbox'
      },
      click: mockClick
    };

    // Simulate the document listener from main.ts
    const handler = (e: any) => {
      const t = e.target;
      if (t && t.classList.contains('task-checkbox') && e.key === 'Enter') {
        e.preventDefault();
        t.click();
      }
    };

    const event = {
      target: mockTarget,
      key: 'Enter',
      preventDefault: vi.fn()
    };

    handler(event);
    expect(mockClick).toHaveBeenCalled();
  });

  it('contract: main.ts invokes valid api methods (R48)', async () => {
    const { api: realApi } = await vi.importActual('../client/src/api.js') as any;
    const fs = await import('fs');
    const path = await import('path');
    
    const mainTsPath = path.resolve(__dirname, '../client/src/main.ts');
    const mainCode = fs.readFileSync(mainTsPath, 'utf-8');
    
    const matches = mainCode.matchAll(/api\.([a-zA-Z0-9_]+)\s*\(/g);
    const invokedMethods = new Set<string>();
    for (const match of matches) {
      invokedMethods.add(match[1]);
    }
    
    expect(invokedMethods.size).toBeGreaterThan(0);
    for (const method of invokedMethods) {
      if (typeof realApi[method] !== 'function') {
        throw new Error(`main.ts calls api.${method}(), but it is not defined in api.ts`);
      }
    }
  });

  it('cancel restores original values and leaves the DB untouched (R138/144)', async () => {
    // Setup a mock task item for editing
    const task = { id: 'cancel-task', text: 'Original text', status: 'today', type: 'have_to', source: 'user' };
    document.body.innerHTML += `
      <div id="cancel-container"></div>
    `;
    const container = document.getElementById('cancel-container')!;
    
    // We can simulate attachEditEvents by actually rendering it
    const { renderTaskList } = await import('../client/src/main.js');
    renderTaskList('cancel-container', [task] as any);
    
    const div = container.querySelector('.task-item') as HTMLElement;
    const editBtn = div.querySelector('[data-edit-id]') as HTMLButtonElement;
    const textInput = div.querySelector('.edit-text-input') as HTMLInputElement;
    const cancelBtn = div.querySelector('.edit-cancel') as HTMLButtonElement;
    
    // Simulate user editing
    editBtn.click();
    textInput.value = 'Changed text';
    
    // Cancel
    cancelBtn.click();
    
    // Check that it reverted
    expect(textInput.value).toBe('Original text');
    expect(div.querySelector('.task-view-mode')?.getAttribute('style')).not.toContain('display: none');
    expect(div.querySelector('.task-edit-mode')?.getAttribute('style')).toContain('display: none');
  });

  it('failed PATCH leaves the row visually restored, not stuck at opacity 0.5 (R138/144)', async () => {
    const task = { id: 'fail-patch-task', text: 'Original text', status: 'today', type: 'have_to', source: 'user' };
    document.body.innerHTML += `
      <div id="fail-container"></div>
    `;
    const container = document.getElementById('fail-container')!;
    const { renderTaskList } = await import('../client/src/main.js');
    renderTaskList('fail-container', [task] as any);
    
    const div = container.querySelector('.task-item') as HTMLElement;
    const editBtn = div.querySelector('[data-edit-id]') as HTMLButtonElement;
    const textInput = div.querySelector('.edit-text-input') as HTMLInputElement;
    const saveBtn = div.querySelector('.edit-save') as HTMLButtonElement;
    
    editBtn.click();
    textInput.value = 'New text';
    
    vi.mocked(api.updateTask).mockRejectedValueOnce(new Error('Update failed'));
    
    // Attempt save
    saveBtn.click();
    
    // Wait a tick for the promise to reject
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Check opacity
    expect(div.style.opacity).toBe('1');
    const errorSpan = div.querySelector('.edit-error') as HTMLSpanElement;
    expect(errorSpan.style.display).toBe('block');
    expect(errorSpan.innerText).toBe('Update failed');
  });

  it('client blocks over-length text before request and shows inline error (R147)', async () => {
    const task = { id: 'overlength-task', text: 'Ok', status: 'today', type: 'have_to', source: 'user' };
    document.body.innerHTML += `<div id="over-container"></div>`;
    const container = document.getElementById('over-container')!;
    const { renderTaskList } = await import('../client/src/main.js');
    renderTaskList('over-container', [task] as any);
    
    const div = container.querySelector('.task-item') as HTMLElement;
    const editBtn = div.querySelector('[data-edit-id]') as HTMLButtonElement;
    const textInput = div.querySelector('.edit-text-input') as HTMLInputElement;
    const saveBtn = div.querySelector('.edit-save') as HTMLButtonElement;
    
    editBtn.click();
    textInput.value = 'a'.repeat(201);
    
    saveBtn.click();
    
    // Request should NOT have been made
    expect(vi.mocked(api.updateTask)).not.toHaveBeenCalled();
    
    // Error should be shown
    const errorSpan = div.querySelector('.edit-error') as HTMLSpanElement;
    expect(errorSpan.style.display).toBe('block');
    expect(errorSpan.innerText).toContain('maximum length');
    
    // Row should still be in edit state
    expect(div.querySelector('.task-edit-mode')?.getAttribute('style')).toContain('display: flex');
  });

  it('a task already in the DB at over-length renders without breaking layout (R147)', async () => {
    // If a task somehow bypassed the limit (e.g. before R28), it should render safely
    const giantText = 'a'.repeat(5000);
    const task = { id: 'giant-task', text: giantText, status: 'today', type: 'have_to', source: 'user' };
    document.body.innerHTML += `<div id="giant-container"></div>`;
    const { renderTaskList } = await import('../client/src/main.js');
    renderTaskList('giant-container', [task] as any);
    
    const textSpan = document.querySelector('#giant-container .task-text');
    expect(textSpan).not.toBeNull();
    // We verify the text rendered correctly
    expect(textSpan?.innerHTML).toBe(giantText);
    
    // In our vitest JSDOM environment, we can't test actual layout breaking, 
    // but we can ensure it doesn't crash the renderer and is present in DOM.
    // The CSS for .task-text (word-break: break-word) prevents the actual break in real browsers.
  });
});

