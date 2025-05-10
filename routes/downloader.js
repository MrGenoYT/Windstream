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

if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir)

// Determine the browser to extract cookies from based on OS
const determineBrowser = () => {
  // List of browsers to try in order of preference
  const browsers = ['chrome', 'firefox', 'edge', 'safari', 'opera']
  
  // Return all browsers as a comma-separated string to try each one
  return browsers.join(',')
}

router.post('/parse', (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  // Use cookies from browser to authenticate
  const browsers = determineBrowser()
  const command = `yt-dlp --cookies-from-browser ${browsers} -J "${url}"`

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error('Error executing yt-dlp:', stderr)
      
      // If cookies failed, try with user-agent as fallback
      const fallbackCommand = `yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" -J "${url}"`
      
      exec(fallbackCommand, (fallbackErr, fallbackStdout, fallbackStderr) => {
        if (fallbackErr) {
          console.error('Fallback also failed:', fallbackStderr)
          return res.status(500).json({ 
            error: 'Failed to fetch video info',
            details: 'YouTube is requiring authentication. Please ensure you are logged into YouTube in a supported browser.'
          })
        }
        
        try {
          const data = JSON.parse(fallbackStdout)
          processVideoData(data, res)
        } catch (parseError) {
          console.error('Error parsing fallback data:', parseError)
          res.status(500).json({ error: 'Error parsing video info' })
        }
      })
      return
    }

    try {
      const data = JSON.parse(stdout)
      processVideoData(data, res)
    } catch (parseError) {
      console.error('Error parsing data:', parseError)
      res.status(500).json({ error: 'Error parsing video info' })
    }
  })
})

// Helper function to process video data
function processVideoData(data, res) {
  const formats = data.formats
    .filter(f => f.url && (f.vcodec !== 'none' || f.acodec !== 'none'))
    .map(f => ({
      url: f.url,
      quality: f.format_note || f.quality_label || f.audio_quality || 'unknown',
      type: f.vcodec === 'none' ? 'Audio' : f.acodec === 'none' ? 'Video' : 'Audio+Video',
      filesize: f.filesize ? formatFileSize(f.filesize) : 'Unknown'
    }))

  res.json({
    title: data.title,
    thumbnail: data.thumbnail,
    duration: formatDuration(data.duration),
    uploader: data.uploader,
    formats
  })
}

// Format file size in human-readable format
function formatFileSize(bytes) {
  if (!bytes) return 'Unknown'
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0) return '0 Byte'
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)))
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i]
}

// Format duration in human-readable format
function formatDuration(seconds) {
  if (!seconds) return 'Unknown'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  return [
    hours > 0 ? hours : null,
    minutes > 0 || hours > 0 ? minutes.toString().padStart(2, '0') : minutes,
    secs.toString().padStart(2, '0')
  ].filter(Boolean).join(':')
}

export default router
