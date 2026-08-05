import { createHmac, timingSafeEqual } from 'crypto'

const BACKEND = 'https://zeron-gmail.vercel.app'
const ALLOWED_ORIGINS = [
  'https://tmp-gmail-miniapp.vercel.app',
  'https://tmp-gmail-miniapp-ieculo4r8-dev-zeron.vercel.app',
  'https://telegram.org',
  'https://t.me',
  'https://web.telegram.org'
]
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/
const UID_RE = /^[0-9]+$/
const TYPES = new Set(['dot', 'plus', 'mixed', 'dotplus'])

// simple in-instance rate limiter (per IP), best-effort under serverless
const windowKey = () => Math.floor(Date.now() / 60000)
const buckets = new Map()
function rateLimited(key, limit, perMinute) {
  const min = 60000 / perMinute
  const now = Date.now()
  const arr = buckets.get(key) || []
  const fresh = arr.filter(t => now - t < min)
  if (fresh.length >= limit) { buckets.set(key, fresh); return true }
  fresh.push(now)
  buckets.set(key, fresh)
  if (buckets.size > 10000) buckets.clear()
  return false
}

// Verify Telegram WebApp initData HMAC against the bot token (defense-in-depth).
function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return false
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return false
    const keys = [...params.keys()].filter(k => k !== 'hash').sort()
    const dataCheck = keys.map(k => `${k}=${params.get(k)}`).join('\n')
    const secretKey = createHmac('sha256', botToken).update('WebAppData').digest()
    const computed = createHmac('sha256', secretKey).update(dataCheck).digest('hex')
    return timingSafeEqual(Buffer.from(computed), Buffer.from(hash))
  } catch { return false }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'origin not allowed' })
  }
  const allow = origin || 'https://tmp-gmail-miniapp.vercel.app'
  res.setHeader('Access-Control-Allow-Origin', allow)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-InitData')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const clientKey = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim()
  if (rateLimited(clientKey, 45, 60)) {
    return res.status(429).json({ error: 'rate limit exceeded, slow down' })
  }

  // Require a valid Telegram WebApp initData. Without a bot token we still
  // demand the header exists (blocks direct curl/scraping reuse).
  const initData = req.headers['x-telegram-initdata'] || ''
  const botToken = process.env.TELEGRAM_BOT_TOKEN || ''
  if (botToken) {
    if (!verifyInitData(initData, botToken)) {
      return res.status(401).json({ error: 'unauthorized: bad initData' })
    }
  } else if (!initData) {
    return res.status(401).json({ error: 'unauthorized: initData required' })
  }
  if (rateLimited('g:' + clientKey, 60, 60)) {
    return res.status(429).json({ error: 'rate limit exceeded' })
  }

  const pass = process.env.APP_PASS
  if (!pass) return res.status(500).json({ error: 'APP_PASS not configured' })

  const { method, email, query, type, uid } = req.query

  let url
  switch (method) {
    case 'read':
      if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid email' })
      url = `${BACKEND}/api/read/${encodeURIComponent(email)}`
      break
    case 'search':
      if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid email' })
      if (!query || query.length > 100) return res.status(400).json({ error: 'invalid query' })
      url = `${BACKEND}/api/readby/${encodeURIComponent(email)}/${encodeURIComponent(query)}`
      break
    case 'generate':
      if (!type || !TYPES.has(type)) return res.status(400).json({ error: 'invalid type' })
      url = `${BACKEND}/api/generate/${type}`
      break
    case 'delete':
      if (!uid || !UID_RE.test(uid)) return res.status(400).json({ error: 'invalid uid' })
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
    const cl = String(text.length)
    if (cl.length > 8) return res.status(502).json({ error: 'invalid backend response' })
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    res.status(r.ok ? 200 : r.status).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}