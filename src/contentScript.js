const MAX_DESC_ROWS = 10

const BTN_ATTR = 'data-pr-slack-copy'
const prPathRegex = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/

let scheduled = false

function schedule() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    ensureButton()
  })
}

function ensureButton() {
  const existing = document.querySelector(`[${BTN_ATTR}]`)
  if (!prPathRegex.test(window.location.pathname)) {
    existing?.remove()
    return
  }
  if (existing) return
  try {
    createCopyBtn()
  } catch {
    // Header not rendered yet; the next mutation or navigation event retries.
  }
}

function mount() {
  new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true})
  for (const evt of ['turbo:render', 'turbo:load', 'popstate']) {
    document.addEventListener(evt, schedule)
    window.addEventListener(evt, schedule)
  }
  schedule()
}

mount()

const BLOCK_SELECTOR = 'p,li,div,h1,h2,h3,h4,h5,h6,pre,blockquote,td,th,summary,details,ul,ol'
const BLOCK_TAGS = new Set(BLOCK_SELECTOR.toUpperCase().split(','))

// Keep whitespace outside the markers, since Slack won't format `* text *`
const wrap = (marker, text) => {
  const [, lead, core, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/)
  return core ? `${lead}${marker}${core}${marker}${trail}` : text
}

// Slack has no table markup, so render tables as an aligned monospace block
const tableToText = (table) => {
  const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
    Array.from(tr.cells).map(cell => cell.textContent.replace(/\s+/g, ' ').trim())
  )
  if (!rows.length) return ''
  const cols = Math.max(...rows.map(r => r.length))
  const widths = Array.from({length: cols}, (_, i) =>
    Math.max(...rows.map(r => [...(r[i] ?? '')].length), 3)
  )
  const fmt = (r) => widths
    .map((w, i) => (r[i] ?? '') + ' '.repeat(w - [...(r[i] ?? '')].length))
    .join(' | ')
    .trimEnd()
  const hasHeader = !!table.querySelector('th')
  const lines = rows.map(fmt)
  if (hasHeader) lines.splice(1, 0, widths.map(w => '-'.repeat(w)).join('-|-'))
  return lines.join('\n')
}

const typeToMd = (item) => {
  const {text, type} = item
  if (/^H[1-6]$/.test(type)) {
    return `*${'#'.repeat(parseInt(type[1]))} ${text.trim()}*`
  }

  switch(type) {
    case 'CODE': {
      if (item.isCodeBlock) return ['```', text.replace(/\n+$/, ''), '```'].join('\n')
      return wrap('`', text)
    }
    case 'EM': return wrap('_', text)
    case 'DEL': return wrap('~', text)
    case 'STRONG': return wrap('*', text)
    case 'A': return `[${text}](${item.href})`
    default: return text
  }
}

/**
 * @param {Object} props
 * @param {string} props.url
 * @param {string} props.title
 * @param {HTMLElement | null} props.comment
 */
const formatMessage = ({
  url,
  title,
  comment
}) => {
  const [_, org, repo, id] = new URL(url).pathname.match(prPathRegex)

  const repoHeader = `_${org} / ${repo}_`
  const prHeader = `*[${title}  #${id}](${url})*`

  if (!comment) {
    return [repoHeader, '', prHeader].join('\n')
  }

  const nodeTree = comment.cloneNode(true)

  // Replace tables with a code block so they go through the code block path
  for (const table of Array.from(nodeTree.querySelectorAll('table')).reverse()) {
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = tableToText(table)
    pre.appendChild(code)
    table.replaceWith(pre)
  }

  const nodes = [nodeTree]

  const isBlock = (n) => n.nodeType === Node.ELEMENT_NODE && (BLOCK_TAGS.has(n.nodeName) || n.nodeName === 'BR')

  // Collapse whitespace, dropping it only where it sits next to block boundaries
  while (nodes.length) {
    const node = nodes.pop()
    if (node.nodeType == Node.TEXT_NODE) {
      if (node.parentElement?.closest('pre')) continue
      node.nodeValue = node.nodeValue.replace(/\s+/g, ' ')
      if (node.nodeValue === '' || (node.nodeValue === ' ' && (
        !node.previousSibling || !node.nextSibling ||
        isBlock(node.previousSibling) || isBlock(node.nextSibling)
      ))) {
        node.parentNode.removeChild(node)
        continue
      }
    } else {
      nodes.push(...node.childNodes)
    }
  }

  const start = nodeTree
  let current = start.firstChild
  let prev
  let depth = 0
  let dIdx = {}
  let brCount = 0
  const listStack = []
  const parsed = []

  const listTags = ['UL', 'OL']

  // Convert to workable format
  while(current !== start) {
    if (current.nodeType === Node.TEXT_NODE) {
      const obj = {
        text: current.nodeValue,
        type: current.parentNode.nodeName,
      }

      if (current.parentNode.nodeName === 'CODE') {
        obj.isCodeBlock = current.parentNode.parentNode.nodeName === 'PRE'
      }

      if (depth > 0) {
        obj.depth = depth
        obj.index = dIdx[depth]
        obj.listType = listStack[listStack.length - 1]
        if (current.parentNode.firstChild &&
          (current.parentNode.firstChild.nodeName === 'INPUT' ||
          current.parentNode.firstChild.nextSibling?.nodeName === 'INPUT')
        ) {
          obj.checked = current.parentNode.firstChild.checked ?? current.parentNode.firstChild.nextSibling?.checked
        }
      }
      obj.group = depth > 0
        ? current.parentElement.closest('li')
        : current.parentElement.closest(BLOCK_SELECTOR)
      obj.br = brCount
      if (current.parentNode.nodeName === 'A') {
        obj.href = current.parentNode.href
      }

      parsed.push(obj)
    }

    // Traversed up to parent from child
    if (prev && prev.parentNode === current) {
      if (listTags.includes(current.nodeName)) {
        listStack.pop()
        depth--
      }
      prev = current
      current = current.nextSibling || current.parentNode
    } else {
      // Traversed to child or sibling
      if (listTags.includes(current.nodeName)) {
        listStack.push(current.nodeName)
        depth++
        dIdx[depth] = 0
      } else if (current.nodeName === 'LI') {
        dIdx[depth]++
      } else if (current.nodeName === 'BR') {
        brCount++
      }
      prev = current
      current = current.firstChild || current.nextSibling || current.parentNode
    }
  }

  // Merge inline pieces (text, code, links...) that belong to the same block into one line
  const lines = []
  for (const item of parsed) {
    const last = lines[lines.length - 1]
    const md = typeToMd(item)
    if (last && !item.isCodeBlock && !last.item.isCodeBlock &&
      last.item.group === item.group && last.item.br === item.br) {
      last.text += md
    } else {
      lines.push({item, text: md})
    }
  }

  // Convert to Slack markup text
  const parts = []
  for (const {item, text} of lines) {
    const content = text.trim()
    if (!content) continue
    if (!item.depth) {
      parts.push(content)
    } else {
      const marker = item.listType === 'OL' ? `${item.index}. ` : '- '
      let padding = '    '.repeat(item.depth - 1) + marker
      if (typeof item.checked !== 'undefined') {
        padding += item.checked ? '☒ ' : '☐ '
      }
      parts.push(`${padding}${content}`)
    }
  }
  const isLong = parts.length > MAX_DESC_ROWS
  const trimmed = isLong ? [...parts.slice(0, MAX_DESC_ROWS), '...'] : parts
  const description = trimmed.join('\n').split('\n').map(l => `> ${l}`).join('\n')

  return [
    repoHeader,
    '',
    prHeader,
    description
  ].join('\n')
}

const titleToText = (el) => {
  let out = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'CODE') {
      out += `\`${node.textContent}\``
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      out += titleToText(node)
    } else {
      out += node.textContent
    }
  }
  return out
}

const getTitle = () => {
  const el =
    document.body.querySelector('h1[data-component="PH_Title"]')?.firstElementChild ??
    document.body.querySelector('bdi.markdown-title')
  if (!el) throw new Error('PR title not found')
  return titleToText(el).trim()
}

const getDescription = () => {
  const comment = document.body.querySelector('div[id^="pullrequest-"] div.comment-body')
  if (!comment || /^no description provided\.?$/i.test(comment.textContent.trim())) {
    return null
  }
  return comment
}

const fallbackCopy = (text) => {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error('execCommand copy failed')
}

const copyText = async (text) => {
  try {
    await window.navigator.clipboard.writeText(text)
  } catch {
    fallbackCopy(text)
  }
}

async function getContent() {
  const url = window.location.origin + window.location.pathname.replace(/\/$/, '')
  const message = formatMessage({
    url,
    title: getTitle(),
    comment: getDescription(),
  })
  await copyText(message)
}

const buildCopyBtn = (className) => {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = className
  btn.setAttribute(BTN_ATTR, '')
  btn.textContent = 'Copy'
  btn.addEventListener('click', async (e) => {
    e.stopPropagation()
    let label = 'Copied!'
    try {
      await getContent()
    } catch (error) {
      console.error('PR Slack copy failed', error)
      label = 'Failed'
    }
    btn.textContent = label
    setTimeout(() => { btn.textContent = 'Copy' }, 1500)
  })
  return btn
}

const createCopyBtn = () => {
  try {
    reactCreate()
  } catch (error) {
    legacyCreate()
  }
}

const legacyCreate = () => {
  const cont = document.body.querySelector('div.gh-header-actions')
  const editBtnClassName = cont.querySelector('button[aria-label*="Edit"]').className
  const className = editBtnClassName.split(' ').filter(c => !c.includes('edit')).join(' ')
  cont.prepend(buildCopyBtn(className))
}

const reactCreate = () => {
  const cont = document.body.querySelector('div[data-component="PH_Actions"]')
  const sibling = Array.from(cont.querySelectorAll('button')).at(-1)
  sibling.parentElement.prepend(buildCopyBtn(sibling.className))
}
