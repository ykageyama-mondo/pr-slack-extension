const DEFAULT_SETTINGS = {
  includeDescription: true,
  maxRows: 10,
}

const includeEl = document.getElementById('includeDescription')
const maxRowsEl = document.getElementById('maxRows')
const statusEl = document.getElementById('status')

const sync = () => {
  maxRowsEl.disabled = !includeEl.checked
}

const save = async () => {
  const maxRows = Math.max(0, Math.floor(Number(maxRowsEl.value)) || 0)
  await chrome.storage.sync.set({
    includeDescription: includeEl.checked,
    maxRows,
  })
  sync()
  statusEl.textContent = 'Saved'
  setTimeout(() => { statusEl.textContent = '' }, 1000)
}

const init = async () => {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS)
  includeEl.checked = settings.includeDescription
  maxRowsEl.value = settings.maxRows
  sync()
  includeEl.addEventListener('change', save)
  maxRowsEl.addEventListener('change', save)
}

init()
