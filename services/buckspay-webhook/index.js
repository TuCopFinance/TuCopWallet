const express = require('express')
const crypto = require('crypto')

const app = express()
const PORT = process.env.PORT || 3000

// BucksPay credentials (server-side only, never exposed to mobile app)
const BUCKSPAY_API_KEY = process.env.BUCKSPAY_API_KEY || ''
const BUCKSPAY_API_SECRET = process.env.BUCKSPAY_API_SECRET || ''
const BUCKSPAY_WEBHOOK_SECRET = process.env.BUCKSPAY_WEBHOOK_SECRET || ''
const BUCKSPAY_API_BASE = 'https://api.buckspay.xyz/v1'

app.use(express.json())

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'buckspay-proxy' })
})

// ─── PROXY ENDPOINTS ────────────────────────────────────────────────────────
// These mirror the BucksPay API but inject credentials server-side.
// The mobile app calls these instead of BucksPay directly.

// Check if user exists: GET /api/check/:address
app.get('/api/check/:address', async (req, res) => {
  try {
    const { address } = req.params
    const response = await fetch(`${BUCKSPAY_API_BASE}/external/check/${address}`, {
      method: 'GET',
      headers: {
        'X-API-Key': BUCKSPAY_API_KEY,
        'X-API-Secret': BUCKSPAY_API_SECRET,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    console.error('Check user error:', error.message)
    res.status(502).json({ message: 'PROXY_ERROR', error: error.message })
  }
})

// Submit transaction: POST /api/transaction
app.post('/api/transaction', async (req, res) => {
  try {
    const response = await fetch(`${BUCKSPAY_API_BASE}/external/transaction`, {
      method: 'POST',
      headers: {
        'X-API-Key': BUCKSPAY_API_KEY,
        'X-API-Secret': BUCKSPAY_API_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    })

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    console.error('Submit transaction error:', error.message)
    res.status(502).json({ message: 'PROXY_ERROR', error: error.message })
  }
})

// Get transaction status: GET /api/transaction/:trxHash
app.get('/api/transaction/:trxHash', async (req, res) => {
  try {
    const { trxHash } = req.params
    const response = await fetch(`${BUCKSPAY_API_BASE}/external/transaction/${trxHash}`, {
      method: 'GET',
      headers: {
        'X-API-Key': BUCKSPAY_API_KEY,
        'X-API-Secret': BUCKSPAY_API_SECRET,
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    console.error('Transaction status error:', error.message)
    res.status(502).json({ message: 'PROXY_ERROR', error: error.message })
  }
})

// ─── WEBHOOK ENDPOINT ───────────────────────────────────────────────────────
// Receives transaction completion callbacks from BucksPay

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-buckspay-signature']
  const body = JSON.stringify(req.body)

  if (BUCKSPAY_WEBHOOK_SECRET && signature) {
    const expected = crypto.createHmac('sha256', BUCKSPAY_WEBHOOK_SECRET).update(body).digest('hex')

    if (signature !== expected) {
      console.error('Invalid webhook signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }
  }

  console.log('BucksPay webhook received:', JSON.stringify(req.body, null, 2))
  res.status(200).json({ received: true })
})

app.listen(PORT, () => {
  console.log(`BucksPay proxy+webhook running on port ${PORT}`)
})
