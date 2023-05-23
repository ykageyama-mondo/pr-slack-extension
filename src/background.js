chrome.runtime.onMessage.addListener(async (request) => {
  if (request.message === 'copy-click')
    await copyPrAsSlack()
})

async function copyPrAsSlack() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true})
  const response = await chrome.tabs.sendMessage(tab.id, {
    message: "get-content",
  })
  if (!response.error)
    await addToClipboard(formatMessage(response))
}

async function addToClipboard(value) {
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.CLIPBOARD],
    justification: 'Write text to the clipboard.'
  });

  chrome.runtime.sendMessage({
    type: 'copy-data-to-clipboard',
    target: 'offscreen-doc',
    data: value
  });
}

const MAX_DESC_LEN = 100

const formatMessage = ({
  url,
  title,
  comment
}) => {
  const [_tld, org, repo, _p, id] = url.replace('https://', '').split('/')

  const repoHeader = `_${org} / ${repo}_`
  const prHeader = `*[${title}  #${id}](${url})*`

  const descParts = comment.startsWith('No description provided') ? [] : comment.split('\n')
  const relev = descParts.length > MAX_DESC_LEN ? [...descParts.slice(0, MAX_DESC_LEN), '...'] : descParts

  const desc = relev.length ? `>${relev.join('\n>')}` : ''

  return [
    repoHeader,
    '',
    prHeader,
    desc
  ].join('\n')
}