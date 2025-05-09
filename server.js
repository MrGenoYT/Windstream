import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import downloaderRoute from './routes/downloader.js'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()
const app = express()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(cors({ origin: process.env.FRONTEND_URL }))
app.use(express.json())
app.use('/api', downloaderRoute)
app.use('/downloads', express.static(path.join(__dirname, 'downloads')))

const PORT = process.env.PORT || 8080
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
