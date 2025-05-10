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

// Determine appropriate browser for the current OS
const getBrowserCookiesFlag = () => {
  const platform = os.platform()
  
  // For demonstration, we're providing common browser options
  // Chrome is widely available on most platforms
  if (platform === 'darwin') return '--cookies-from-browser chrome'  // macOS
  if (platform === 'win32') return '--cookies-from-browser chrome'   // Windows
  return '--cookies-from-browser firefox'  // Linux and others default to Firefox
}

router.post('/parse', (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  // Use cookies from browser to avoid the "not a bot" verification
  // This assumes Chrome/Firefox is installed on the server
  const cookiesFlag = getBrowserCookiesFlag()
  
  const command = `yt-dlp ${cookiesFlag} -J "${url}"`

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error('Error executing yt-dlp:', stderr)
      return res.status(500).json({ 
        error: 'Failed to fetch video info',
        details: stderr
      })
    }

    try {
      const data = JSON.parse(stdout)
      
      // Extract video thumbnail
      const thumbnail = data.thumbnail || 
                        (data.thumbnails && data.thumbnails.length > 0 ? 
                         data.thumbnails[data.thumbnails.length - 1].url : 
                         '');
      
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

      res.json({
        title: data.title,
        thumbnail,
        formats
      })
    } catch (parseError) {
      console.error('Error parsing video info:', parseError)
      res.status(500).json({ error: 'Error parsing video info' })
    }
  })
})

// Add a download endpoint with cookies support
router.post('/download', (req, res) => {
  const { url, format = 'best' } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  // Generate a unique filename
  const fileId = uuidv4()
  const outputTemplate = path.join(downloadDir, `${fileId}.%(ext)s`)
  
  // Use cookies from browser
  const cookiesFlag = getBrowserCookiesFlag()
  
  // Command for downloading with format selection
  const formatFlag = format !== 'best' ? `-f ${format}` : '-f best'
  const command = `yt-dlp ${cookiesFlag} ${formatFlag} -o "${outputTemplate}" "${url}"`

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error('Download error:', stderr)
      return res.status(500).json({ 
        error: 'Failed to download video',
        details: stderr
      })
    }

    // Find the created file
    fs.readdir(downloadDir, (err, files) => {
      if (err) {
        return res.status(500).json({ error: 'Could not read download directory' })
      }
      
      const downloadedFile = files.find(file => file.startsWith(fileId))
      
      if (!downloadedFile) {
        return res.status(500).json({ error: 'File not found after download' })
      }
      
      const downloadPath = `/downloads/${downloadedFile}`
      res.json({ 
        success: true, 
        message: 'Download completed',
        downloadPath 
      })
    })
  })
})

export default router
