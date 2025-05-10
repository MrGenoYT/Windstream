import axios from 'axios';

/**
 * Main API configuration with axios
 */
const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL
});

/**
 * Custom error handler to extract the error message from the response
 */
const handleApiError = (error) => {
  // Extract the most specific error message available
  const errorMessage = 
    error.response?.data?.details || 
    error.response?.data?.error || 
    error.message || 
    'An unknown error occurred';
  
  // Create a new error with the extracted message
  const formattedError = new Error(errorMessage);
  
  // Preserve the original error properties
  formattedError.originalError = error;
  formattedError.status = error.response?.status;
  
  throw formattedError;
};

/**
 * Fetch video information from a URL
 * @param {string} url - Video URL to extract information from
 * @returns {Promise<Object>} - Video metadata and available formats
 */
export const fetchInfo = async (url) => {
  try {
    const response = await API.post('/api/parse', { url });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Download a video with specific format
 * @param {string} url - Video URL to download
 * @param {string} format - Format ID to download (optional)
 * @returns {Promise<Object>} - Download information including download URL
 */
export const downloadVideo = async (url, format = 'best') => {
  try {
    const response = await API.post('/api/download', { url, format });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get full download URL for a file
 * @param {string} relativePath - Relative path returned from the download endpoint
 * @returns {string} - Full URL to download the file
 */
export const getDownloadUrl = (relativePath) => {
  // Remove leading slash if present
  const path = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
  return `${import.meta.env.VITE_BACKEND_URL}/${path}`;
};

/**
 * Check if a URL is valid for processing
 * @param {string} url - URL to validate
 * @returns {boolean} - Whether the URL is valid
 */
export const isValidVideoUrl = (url) => {
  if (!url) return false;
  
  try {
    // Create URL object to validate
    const urlObj = new URL(url);
    
    // Check if it's from a supported domain
    const supportedDomains = [
      'youtube.com', 
      'youtu.be', 
      'vimeo.com', 
      'dailymotion.com',
      'facebook.com',
      'twitch.tv',
      'twitter.com',
      'instagram.com'
    ];
    
    return supportedDomains.some(domain => urlObj.hostname.includes(domain));
  } catch (error) {
    return false;
  }
};
