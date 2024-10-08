const MAX_DESC_ROWS = 10

window.addEventListener('load', mount, {
  once: true,
})

const prHrefRegex = /^https:\/\/github\.com\/(.+)\/(.+)\/pull\/([0-9]+)$/
function mount() {
  const observer = new MutationObserver((ele) => {
    if (prHrefRegex.test(document.location.href)) {
      if (!copyBtn)
        createCopyBtn()
    } else {
      if (copyBtn) {
        copyBtn.remove()
        copyBtn = undefined
      }
    }
  })
  observer.observe(document.body, {childList: true, subtree: true, attributes: true})
}

const typeToMd = (item) => {
  const {text, type} = item
  if (/H[0-5]/.test(type)) {
    return `*${'#'.repeat(parseInt(type[1]))} ${text}*`
  }

  switch(type) {
    case 'CODE': {
      const marker = item.isCodeBlock ? '```' : '`'
      return [marker, text, marker].join(item.isCodeBlock ? '\n' : '')
    }
    case 'EM': return `_${text}_`
    case 'DEL': return `~${text}~`
    case 'STRONG': return `*${text}*`
    case 'A': return `[${text}](${item.href})`
    default: return text
  }
}

/**
 * @param {Object} props
 * @param {string} props.url
 * @param {string} props.title
 * @param {HTMLElement} props.comment
 */
const formatMessage = ({
  url,
  title,
  comment
}) => {
  const [_, org, repo, id] = url.match(prHrefRegex)

  const repoHeader = `_${org} / ${repo}_`
  const prHeader = `*[${title}  #${id}](${url})*`

  const nodeTree = comment.cloneNode(true)

  const nodes = [nodeTree]

  // Remove spacing nodes
  while (nodes.length) {
    const node = nodes.pop()
    if (node.nodeType == Node.TEXT_NODE) {
      node.nodeValue = node.nodeValue.trim()
      if (node.nodeValue.length === 0 || node.nodeValue === '\n') {
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
  let listType;
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
        obj.listType = listType
        if (current.parentNode.firstChild &&
          (current.parentNode.firstChild.nodeName === 'INPUT' ||
          current.parentNode.firstChild.nextSibling?.nodeName === 'INPUT')
        ) {
          obj.checked = current.parentNode.firstChild.checked ?? current.parentNode.firstChild.nextSibling?.checked
        }
      }
      if (current.parentNode.nodeName === 'A') {
        obj.href = current.parentNode.href
      }

      parsed.push(obj)
    }

    // Traversed up to parent from child
    if (prev && prev.parentNode === current) {
      if (listTags.includes(current.nodeName)) {
        listType = current.nodeName
        depth--
      }
      prev = current
      current = current.nextSibling || current.parentNode
    } else {
      // Traversed to child or sibling
      if (listTags.includes(current.nodeName)) {
        listType = current.nodeName
        depth++
        dIdx[depth] = 0
      } else if (current.nodeName === 'LI') {
        dIdx[depth]++
      }
      prev = current
      current = current.firstChild || current.nextSibling || current.parentNode
    }
  }

  const parts = []

  // Convert to Slack markup text
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i]
    if (!item.depth) {
      parts.push(typeToMd(item))
    } else {
      const prev = parsed[i - 1]

      if (prev && prev.depth === item.depth &&  prev.index === item.index) {
        parts[parts.length - 1] += ` ${typeToMd(item)}`
      } else {
        const marker = item.listType === 'OL' ? `${item.index}. ` : '- '
        let padding = '  '.repeat(item.depth - 1) + marker
        if (typeof item.checked !== 'undefined') {
          padding += item.checked ? '☒ ' : '☐ '
        }
        parts.push(`${padding}${typeToMd(item)}`)
      }
    }
  }
  const isLong = parts.length > MAX_DESC_ROWS
  const trimmed = isLong ? [...parts.slice(0, MAX_DESC_ROWS), '...'] : parts
  const description = `> ${trimmed.join('\n> ')}`

  return [
    repoHeader,
    '',
    prHeader,
    description
  ].join('\n')
}

function getContent() {

  const prId = document.head.querySelector('meta[name~=hovercard-subject-tag][content]').content.split(':')[1]
  const descId = `pullrequest-${prId}`

  const url = window.location.href
  const title = document.body.querySelector('bdi.markdown-title').innerHTML
  const comment = document.body.querySelector(`div#${descId} div.comment-body`)

  const message = formatMessage({
    url, title, comment
  })
  window.navigator.clipboard.writeText(message)
}

const getDiscussionHeader = () => document.body.querySelector('div#partial-discussion-header')

let copyBtn
const createCopyBtn = () => {
  const cont = document.body.querySelector('div.gh-header-actions')
  const editBtnClassName = cont.querySelector('button[aria-label*="Edit"]').className
  copyBtn = document.createElement('button')
  copyBtn.className = editBtnClassName.split(' ').filter(c => !c.includes('edit')).join(' ')
  copyBtn.innerText = 'Copy'
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation()
    getContent()
  })
  cont.prepend(copyBtn)
}

