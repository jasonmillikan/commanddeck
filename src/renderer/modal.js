import { uid, escHtml } from './utils.js';

let editingId = null;
let modalTags = [];
let _getConfig, _persist, _renderAll;

export function initModal({ getConfig, persist, renderAll }) {
  _getConfig = getConfig;
  _persist = persist;
  _renderAll = renderAll;
}

function renderTagChips() {
  const wrap = document.getElementById('f-tags-wrap');
  const input = document.getElementById('f-tags-input');
  wrap.querySelectorAll('.tag-chip').forEach(el => el.remove());
  modalTags.forEach((tag, i) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escHtml(tag)}<button class="tag-chip-remove" data-index="${i}" tabindex="-1">×</button>`;
    wrap.insertBefore(chip, input);
  });
}

function populateTagsDatalist() {
  const all = [...new Set(_getConfig().commands.flatMap(c => c.tags || []).filter(Boolean))];
  const dl = document.getElementById('tags-datalist');
  dl.innerHTML = all.map(t => `<option value="${escHtml(t)}">`).join('');
}

export function openModal(cmd = null) {
  editingId = cmd?.id || null;
  document.getElementById('modal-title').textContent = cmd ? 'Edit Command' : 'New Command';
  document.getElementById('f-label').value = cmd?.label || '';
  document.getElementById('f-note').value = cmd?.note || '';
  document.getElementById('f-type').value = cmd?.type || 'toggle';
  document.getElementById('f-on').value = cmd?.onCmd || cmd?.launchCmd || '';
  document.getElementById('f-off').value = cmd?.offCmd || '';
  document.getElementById('f-auto-restore').checked = cmd?.autoRestore || false;
  document.getElementById('f-content').value = cmd?.content || '';
  modalTags = [...(cmd?.tags || [])];
  populateTagsDatalist();
  renderTagChips();
  document.getElementById('f-tags-input').value = '';
  updateModalFields();
  document.getElementById('modal-delete').style.display = editingId ? '' : 'none';
  document.getElementById('modal-backdrop').classList.add('open');
  document.getElementById('f-label').focus();
}

export function updateModalFields() {
  const type = document.getElementById('f-type').value;
  const onLabel = document.getElementById('f-on-label');
  const onRow = document.getElementById('f-on-row');
  const offRow = document.getElementById('f-off-row');
  const autoRestoreRow = document.getElementById('f-auto-restore-row');
  const contentRow = document.getElementById('f-content-row');

  if (type === 'cheatsheet') {
    onRow.style.display = 'none';
    offRow.style.display = 'none';
    autoRestoreRow.style.display = 'none';
    contentRow.style.display = '';
    return;
  }
  contentRow.style.display = 'none';
  onRow.style.display = '';
  if (type === 'toggle') {
    onLabel.firstChild.textContent = 'ON Command ';
    offRow.style.display = '';
    autoRestoreRow.style.display = '';
  } else if (type === 'launcher') {
    onLabel.firstChild.textContent = 'Launch Command ';
    offRow.style.display = 'none';
    autoRestoreRow.style.display = 'none';
    document.getElementById('f-auto-restore').checked = false;
  } else {
    onLabel.firstChild.textContent = 'Command ';
    offRow.style.display = 'none';
    autoRestoreRow.style.display = 'none';
    document.getElementById('f-auto-restore').checked = false;
  }
}

export function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  document.getElementById('modal-delete').style.display = 'none';
  editingId = null;
}

document.getElementById('f-type').addEventListener('change', updateModalFields);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-delete').addEventListener('click', async () => {
  const cmd = _getConfig().commands.find(c => c.id === editingId);
  if (!cmd) return;
  if (confirm(`Delete "${cmd.label}"?`)) {
    _getConfig().commands = _getConfig().commands.filter(c => c.id !== editingId);
    await _persist();
    closeModal();
    _renderAll();
  }
});
document.getElementById('modal-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById('f-tags-wrap').addEventListener('click', e => {
  const btn = e.target.closest('.tag-chip-remove');
  if (btn) {
    modalTags.splice(Number(btn.dataset.index), 1);
    renderTagChips();
  } else {
    document.getElementById('f-tags-input').focus();
  }
});

document.getElementById('f-tags-input').addEventListener('keydown', e => {
  const input = e.target;
  if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
    e.preventDefault();
    const tag = input.value.trim().replace(/,$/, '');
    if (tag && !modalTags.includes(tag)) modalTags.push(tag);
    input.value = '';
    renderTagChips();
  } else if (e.key === 'Backspace' && input.value === '' && modalTags.length > 0) {
    modalTags.pop();
    renderTagChips();
  }
});

document.getElementById('f-tags-input').addEventListener('change', e => {
  const tag = e.target.value.trim();
  if (tag && !modalTags.includes(tag)) {
    modalTags.push(tag);
    e.target.value = '';
    renderTagChips();
  }
});

document.getElementById('modal-save').addEventListener('click', async () => {
  const label = document.getElementById('f-label').value.trim();
  const type = document.getElementById('f-type').value;

  const tagInput = document.getElementById('f-tags-input');
  const pending = tagInput.value.trim().replace(/,$/, '');
  if (pending && !modalTags.includes(pending)) modalTags.push(pending);
  tagInput.value = '';

  if (type === 'cheatsheet') {
    const content = document.getElementById('f-content').value.trim();
    if (!label || !content) { alert('Label and content are required.'); return; }
    const entry = {
      id: editingId || uid(),
      label,
      note: document.getElementById('f-note').value.trim(),
      type: 'cheatsheet',
      tags: [...modalTags],
      content,
    };
    if (editingId) {
      const idx = _getConfig().commands.findIndex(c => c.id === editingId);
      if (idx !== -1) _getConfig().commands[idx] = entry;
    } else {
      _getConfig().commands.push(entry);
    }
    await _persist();
    closeModal();
    _renderAll();
    return;
  }

  const onCmd = document.getElementById('f-on').value.trim();
  if (!label || !onCmd) { alert('Label and command are required.'); return; }

  const entry = {
    id: editingId || uid(),
    label,
    note: document.getElementById('f-note').value.trim(),
    type,
    tags: [...modalTags],
    ...(type === 'toggle' ? {
      onCmd,
      offCmd: document.getElementById('f-off').value.trim(),
      autoRestore: document.getElementById('f-auto-restore').checked,
    } : {}),
    ...(type === 'launcher'  ? { launchCmd: onCmd } : {}),
    ...(type === 'foreground' ? { onCmd } : {}),
  };

  if (editingId) {
    const idx = _getConfig().commands.findIndex(c => c.id === editingId);
    if (idx !== -1) _getConfig().commands[idx] = entry;
  } else {
    _getConfig().commands.push(entry);
  }
  await _persist();
  closeModal();
  _renderAll();
});
