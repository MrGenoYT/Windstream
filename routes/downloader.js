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

// Determine available browsers based on OS
const getAvailableBrowsers = () => {
  const browsers = ['chrome', 'firefox', 'edge', 'safari', 'opera', 'brave', 'chromium', 'vivaldi', 'whale']
  
  // Return array of browsers to try them one by one
  return browsers
}

router.post('/parse', (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  // Get list of browsers to try
  const browsers = getAvailableBrowsers()
  
  // Try each browser sequentially
  tryNextBrowser(browsers, 0, url, res)
})

function tryNextBrowser(browsers, index, url, res) {
  // If we've tried all browsers, use fallback method
  if (index >= browsers.length) {
    console.log('All browsers failed, trying fallback method')
    useFallbackMethod(url, res)
    return
  }

  const browser = browsers[index]
  console.log(`Trying browser: ${browser}`)
  
  const command = `yt-dlp --cookies-from-browser ${browser} -J "${url}"`

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.log(`Browser ${browser} failed:`, stderr)
      // Try next browser
      tryNextBrowser(browsers, index + 1, url, res)
      return
    }

    try {
      const data = JSON.parse(stdout)
      processVideoData(data, res)
    } catch (parseError) {
      console.error('Error parsing data:', parseError)
      // Try next browser
      tryNextBrowser(browsers, index + 1, url, res)
    }
  })
}

function useFallbackMethod(url, res) {
  // Try with user-agent and no cookies as fallback
  const fallbackCommand = `yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36" -J "${url}"`
  
  exec(fallbackCommand, (fallbackErr, fallbackStdout, fallbackStderr) => {
    if (fallbackErr) {
      console.error('Fallback also failed:', fallbackStderr)
      
      // Check if it's an authentication issue
      if (fallbackStderr.includes('Sign in to confirm') || fallbackStderr.includes('cookies')) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'YouTube is requiring authentication. Please ensure you have the yt-dlp cookie extractor setup correctly.',
          details: fallbackStderr
        })
      }
      
      return res.status(500).json({ 
        error: 'Failed to fetch video info',
        details: fallbackStderr
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
}

// Add a download endpoint
router.post('/download', (req, res) => {
  const { url, format } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })
  
  const outputId = uuidv4()
  const outputPath = path.join(downloadDir, `${outputId}.%(ext)s`)
  
  // Format options
  const formatOption = format ? `-f ${format}` : '-f best'
  
  // Try all browsers for downloading
  const browsers = getAvailableBrowsers()
  tryDownloadWithBrowsers(browsers, 0, url, formatOption, outputId, outputPath, res)
})

function tryDownloadWithBrowsers(browsers, index, url, formatOption, outputId, outputPath, res) {
  if (index >= browsers.length) {
    console.log('All browsers failed for download, trying fallback method')
    downloadWithFallback(url, formatOption, outputId, outputPath, res)
    return
  }

  const browser = browsers[index]
  console.log(`Trying download with browser: ${browser}`)
  
  const command = `yt-dlp --cookies-from-browser ${browser} ${formatOption} -o "${outputPath}" "${url}"`
  
  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.log(`Download with ${browser} failed:`, stderr)
      tryDownloadWithBrowsers(browsers, index + 1, url, formatOption, outputId, outputPath, res)
      return
    }
    
    // Find the actual filename that was created
    fs.readdir(downloadDir, (err, files) => {
      if (err) {
        console.error('Error reading download directory:', err)
        return res.status(500).json({ error: 'Error reading download directory' })
      }
      
      const downloadedFile = files.find(file => file.startsWith(outputId))
      if (!downloadedFile) {
        return res.status(500).json({ error: 'Download failed or file not found' })
      }
      
      res.json({
        success: true,
        message: 'Download completed',
        downloadUrl: `/downloads/${downloadedFile}`
      })
    })
  })
}

function downloadWithFallback(url, formatOption, outputId, outputPath, res) {
  const fallbackCommand = `yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36" ${formatOption} -o "${outputPath}" "${url}"`
  
  exec(fallbackCommand, (err, stdout, stderr) => {
    if (err) {
      console.error('Fallback download failed:', stderr)
      return res.status(500).json({ 
        error: 'Download failed', 
        details: stderr
      })
    }
    
    // Find the actual filename that was created
    fs.readdir(downloadDir, (err, files) => {
      if (err) {
        console.error('Error reading download directory:', err)
        return res.status(500).json({ error: 'Error reading download directory' })
      }
      
      const downloadedFile = files.find(file => file.startsWith(outputId))
      if (!downloadedFile) {
        return res.status(500).json({ error: 'Download failed or file not found' })
      }
      
      res.json({
        success: true,
        message: 'Download completed',
        downloadUrl: `/downloads/${downloadedFile}`
      })
    })
  })
}

// Helper function to process video data
function processVideoData(data, res) {
  const formats = data.formats
    .filter(f => f.url && (f.vcodec !== 'none' || f.acodec !== 'none'))
    .map(f => ({
      url: f.url,
      format_id: f.format_id, // Add format_id for download endpoint
      quality: f.format_note || f.quality_label || f.audio_quality || 'unknown',
      type: f.vcodec === 'none' ? 'Audio' : f.acodec === 'none' ? 'Video' : 'Audio+Video',
      filesize: f.filesize ? formatFileSize(f.filesize) : 'Unknown',
      ext: f.ext || 'mp4'
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
