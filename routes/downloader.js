import express from 'express'
import { exec } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const downloadDir = path.join(__dirname, '../downloads')

// Ensure download directory exists
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir)

// Determine list of browsers to attempt for cookies
const getBrowserList = () => {
  const platform = os.platform()
  // Order browsers by priority
  if (platform === 'darwin') return ['chrome', 'safari', 'firefox']
  if (platform === 'win32') return ['chrome', 'edge', 'firefox']
  return ['chrome', 'firefox']
}

// Generic executor with cookie fallbacks
const execWithCookies = (browsers, buildCommand, onSuccess, onFailure) => {
  const tryIndex = (index) => {
    if (index >= browsers.length) {
      return onFailure(new Error('All browsers failed'))
    }
    const cookiesFlag = `--cookies-from-browser ${browsers[index]}`
    const command = buildCommand(cookiesFlag)
    exec(command, (err, stdout, stderr) => {
      if (err) {
        console.warn(`Cookies from ${browsers[index]} failed, trying next...`, stderr)
        tryIndex(index + 1)
      } else {
        onSuccess(stdout)
      }
    })
  }
  tryIndex(0)
}

router.post('/parse', (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  const browsers = getBrowserList()
  execWithCookies(
    browsers,
    (cookiesFlag) => `yt-dlp ${cookiesFlag} -J "${url}"`,
    (stdout) => {
      try {
        const data = JSON.parse(stdout)
        const thumbnail = data.thumbnail ||
                          (data.thumbnails && data.thumbnails.length > 0 ?
                           data.thumbnails[data.thumbnails.length - 1].url :
                           '')
        const formats = data.formats
          .filter(f => f.url && (f.vcodec !== 'none' || f.acodec !== 'none'))
          .map(f => ({
            url: f.url,
            quality: f.format_note || f.quality_label || f.height?.toString() ||
                    (f.acodec !== 'none' ? f.asr?.toString() + 'Hz' : null) || 'unknown',
            type: f.vcodec === 'none' ? 'Audio' : f.acodec === 'none' ? 'Video' : 'Audio+Video',
            ext: f.ext || 'mp4',
            filesize: f.filesize ? Math.round(f.filesize / (1024 * 1024)) + ' MB' : 'Unknown size'
          }))
        res.json({ title: data.title, thumbnail, formats })
      } catch (parseError) {
        console.error('Error parsing video info:', parseError)
        res.status(500).json({ error: 'Error parsing video info' })
      }
    },
    (error) => {
      console.error('Failed to fetch video info with all cookies:', error)
      res.status(500).json({ error: 'Failed to fetch video info' })
    }
  )
})

// Add a download endpoint with cookies support and fallbacks
router.post('/download', (req, res) => {
  const { url, format = 'best' } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  const fileId = uuidv4()
  const outputTemplate = path.join(downloadDir, `${fileId}.%(ext)s`)
  const formatFlag = format !== 'best' ? `-f ${format}` : '-f best'
  const browsers = getBrowserList()

  execWithCookies(
    browsers,
    (cookiesFlag) => `yt-dlp ${cookiesFlag} ${formatFlag} -o "${outputTemplate}" "${url}"`,
    () => {
      fs.readdir(downloadDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Could not read download directory' })
        const downloadedFile = files.find(file => file.startsWith(fileId))
        if (!downloadedFile) {
          return res.status(500).json({ error: 'File not found after download' })
        }
        res.json({ success: true, message: 'Download completed', downloadPath: `/downloads/${downloadedFile}` })
      })
    },
    (error) => {
      console.error('Download failed with all cookies:', error)
      res.status(500).json({ error: 'Failed to download video' })
    }
  )
})

export default router
