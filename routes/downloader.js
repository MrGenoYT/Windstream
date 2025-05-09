import express from 'express'
import { exec } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const downloadDir = path.join(__dirname, '../downloads')

if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir)

router.post('/parse', (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  const command = `yt-dlp -J "${url}"`

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error(stderr)
      return res.status(500).json({ error: 'Failed to fetch video info' })
    }

    try {
      const data = JSON.parse(stdout)
      const formats = data.formats
        .filter(f => f.url && (f.vcodec !== 'none' || f.acodec !== 'none'))
        .map(f => ({
          url: f.url,
          quality: f.format_note || f.quality_label || f.audio_quality || 'unknown',
          type: f.vcodec === 'none' ? 'Audio' : f.acodec === 'none' ? 'Video' : 'Audio+Video'
        }))

      res.json({
        title: data.title,
        formats
      })
    } catch (parseError) {
      console.error(parseError)
      res.status(500).json({ error: 'Error parsing video info' })
    }
  })
})

export default router
