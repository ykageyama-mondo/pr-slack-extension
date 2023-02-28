chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(request, _sender, sendResponse) {
console.log('🚀 ~ file: contentScript.js:4 ~ handleMessages ~ request:', request)
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
  const comment = document.body.querySelector(`div#${descId} div.comment-body p`).innerText
  return {
    url,
    title,
    comment
  }
}

const mount = () => {
  const cont = document.body.querySelector('div.gh-header-actions')
  const copyBtn = document.createElement('button')
  copyBtn.className = 'btn btn-sm d-inline-block float-left float-none m-0 mr-md-1 flex-md-order-2'
  copyBtn.innerText = 'Copy'
  copyBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({message: 'copy-click'})
  })
  cont.prepend(copyBtn)
}
mount()