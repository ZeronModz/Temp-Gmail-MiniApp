const BACKEND = 'https://zeron-gmail.vercel.app'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const pass = process.env.APP_PASS
  if (!pass) {
    res.status(500).json({ error: 'APP_PASS not configured' })
    return
  }

  const { method, email, query, type, uid } = req.query

  let url
  switch (method) {
    case 'read':
      if (!email) return res.status(400).json({ error: 'email required' })
      url = `${BACKEND}/api/read/${encodeURIComponent(email)}`
      break
    case 'search':
      if (!email || !query) return res.status(400).json({ error: 'email and query required' })
      url = `${BACKEND}/api/readby/${encodeURIComponent(email)}/${encodeURIComponent(query)}`
      break
    case 'generate':
      if (!type) return res.status(400).json({ error: 'type required (dot/plus/mixed)' })
      url = `${BACKEND}/api/generate/${type}`
      break
    case 'delete':
      if (!uid) return res.status(400).json({ error: 'uid required' })
      url = `${BACKEND}/api/delete/${encodeURIComponent(uid)}`
      break
    default:
      return res.status(400).json({ error: `unknown method: ${method}` })
  }

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${pass}` }
    })
    const text = await r.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    res.status(r.ok ? 200 : r.status).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
