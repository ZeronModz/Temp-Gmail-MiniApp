const BACKEND = 'https://zeron-gmail.vercel.app'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const pass = process.env.APP_PASS
  if (!pass) {
    res.status(500).json({ error: 'APP_PASS not configured on server' })
    return
  }

  const method = req.query.method || ''
  if (!method) {
    res.status(400).json({ error: 'method parameter required' })
    return
  }

  const params = { ...req.query }
  delete params.method

  const qs = new URLSearchParams(params).toString()
  const url = `${BACKEND}/api/${method}${qs ? '?' + qs : ''}`

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${pass}` }
    })

    if (!r.ok) {
      const text = await r.text()
      res.status(r.status).json({ error: text, status: r.status })
      return
    }

    const data = await r.json()
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
