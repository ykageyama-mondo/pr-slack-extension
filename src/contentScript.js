chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(request, _sender, sendResponse) {
  if (request.message === 'get-content') {
    try {
      const content = getContent()
      sendResponse(content)
    } catch (error) {
      sendResponse({
        error: true
      })
    }
  }
}

function getContent() {

  const prId = document.head.querySelector('meta[name~=hovercard-subject-tag][content]').content.split(':')[1]
  const descId = `pullrequest-${prId}`

  const url = window.location.href
  const title = document.body.querySelector('bdi.markdown-title').innerHTML
  const comment = document.body.querySelector(`div#${descId} div.comment-body`).innerText
  return {
    url,
    title,
    comment
  }
}

const getDiscussionHeader = () => document.body.querySelector('div#partial-discussion-header')

let copyBtn

const createCopyBtn = () => {
  const cont = document.body.querySelector('div.gh-header-actions')
  copyBtn = document.createElement('button')
  copyBtn.className = 'btn btn-sm d-inline-block float-left float-none m-0 mr-md-1 flex-md-order-2'
  copyBtn.innerText = 'Copy'
  copyBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({message: 'copy-click'})
  })
  cont.prepend(copyBtn)
}

const mount = () => {
  const header = getDiscussionHeader()
  const observer = new MutationObserver((ele) => {
    const hT = ele.find(v => v.target.isSameNode(getDiscussionHeader()))
    if (hT) {
      if (copyBtn)
        copyBtn.remove()
      createCopyBtn()
    }
  })
  observer.observe(header.parentNode, {childList: true, subtree: true, attributes: true})
}
mount()